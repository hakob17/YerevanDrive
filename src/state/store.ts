// Zustand store. Holds the simulation instance and a "published" snapshot
// used by UI panels. The Three.js rendering layer reads directly from the
// simulation for per-frame position data (no re-renders).

import { create } from "zustand";
import { Simulation } from "../sim/simulation";
import { buildNetwork } from "../sim/network";
import { bindOrchestratorNetwork } from "../sim/orchestrator";
import type { AccidentEvent, ControllerMode, KPISnapshot, RenovationEvent } from "../sim/types";

export interface KPIHistoryPoint {
  t: number;
  avgWait: number;
  throughput: number;
  totalQueue: number;
}

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

interface Store {
  sim: Simulation;
  mode: ControllerMode;
  setMode: (m: ControllerMode) => void;
  demandScale: number;
  setDemandScale: (v: number) => void;
  kpi: KPISnapshot;
  kpiHistory: KPIHistoryPoint[];
  // Baseline is captured when toggling from fixed to smart to show improvement.
  baselineKPI: { avgWait: number; throughput: number; totalQueue: number } | null;
  publishKPI: () => void;
  resetSim: () => void;

  // events
  addAccident: (laneId: string) => void;
  clearAllEvents: () => void;
  addRenovation: (laneId: string) => void;
  events: { accidents: AccidentEvent[]; renovations: RenovationEvent[] };

  // chat
  chat: ChatMsg[];
  sendChat: (msg: string) => Promise<void>;
  chatPending: boolean;

  // selection / editor
  selectedLaneId: string | null;
  setSelectedLaneId: (id: string | null) => void;
  toggleLaneClosed: (laneId: string) => void;
}

const network = buildNetwork();
bindOrchestratorNetwork(network);
const sim = new Simulation(network);

export const useStore = create<Store>((set, get) => ({
  sim,
  mode: "fixed",
  setMode: (m) => {
    const s = get().sim;
    // Capture baseline when switching from fixed to smart (to compute "improvement %")
    if (m === "smart" && get().mode === "fixed") {
      set({ baselineKPI: { ...s.kpi() } });
    }
    s.setMode(m);
    set({ mode: m });
  },
  demandScale: 1,
  setDemandScale: (v) => {
    get().sim.demandScale = v;
    set({ demandScale: v });
  },
  kpi: sim.kpi(),
  kpiHistory: [],
  baselineKPI: null,
  publishKPI: () => {
    const s = get().sim;
    const k = s.kpi();
    const hist = get().kpiHistory;
    const next = [...hist, { t: k.t, avgWait: k.avgWait, throughput: k.throughput, totalQueue: k.totalQueue }];
    if (next.length > 120) next.shift();
    set({ kpi: k, kpiHistory: next });
  },
  resetSim: () => {
    get().sim.reset();
    set({ kpiHistory: [], baselineKPI: null, events: { accidents: [], renovations: [] } });
  },

  events: { accidents: [], renovations: [] },
  addAccident: (laneId) => {
    const s = get().sim;
    const lane = s.network.lanes.get(laneId);
    if (!lane) return;
    const ev: AccidentEvent = {
      id: `acc-${Date.now()}`,
      laneId,
      s: lane.length * 0.55,
      clearsAt: s.time * 1000 + 90_000,
    };
    s.addAccident(ev);
    set({ events: { ...get().events, accidents: [...get().events.accidents, ev] } });
  },
  addRenovation: (laneId) => {
    const s = get().sim;
    const ev: RenovationEvent = {
      id: `ren-${Date.now()}`,
      laneId,
      clearsAt: s.time * 1000 + 180_000,
    };
    s.addRenovation(ev);
    set({ events: { ...get().events, renovations: [...get().events.renovations, ev] } });
  },
  clearAllEvents: () => {
    const s = get().sim;
    for (const a of get().events.accidents) s.clearAccident(a.id);
    for (const r of get().events.renovations) s.clearRenovation(r.id);
    set({ events: { accidents: [], renovations: [] } });
  },

  chat: [
    {
      role: "assistant",
      content:
        "Hi — I'm your planning co-pilot. Ask me things like: \"What's the biggest bottleneck right now?\", \"Should we add a left-turn lane at I3?\", or \"Where would a dedicated bus lane help most?\"",
    },
  ],
  chatPending: false,
  sendChat: async (msg) => {
    const { chat, sim: s } = get();
    const userMsg: ChatMsg = { role: "user", content: msg };
    set({ chat: [...chat, userMsg], chatPending: true });
    try {
      const systemContext = buildChatSystemContext(s, get().mode, get().kpi);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 700,
          system: systemContext,
          messages: [...get().chat, userMsg].map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await response.json();
      let text = "";
      if (data.content && Array.isArray(data.content)) {
        for (const block of data.content) if (block.type === "text") text += block.text;
      } else if (data.error) {
        text = `⚠ ${typeof data.error === "string" ? data.error : JSON.stringify(data.error)}`;
      } else {
        text = "(no response)";
      }
      set({
        chat: [...get().chat, { role: "assistant", content: text }],
        chatPending: false,
      });
    } catch (e) {
      set({
        chat: [
          ...get().chat,
          { role: "assistant", content: `⚠ Request failed: ${String(e)}` },
        ],
        chatPending: false,
      });
    }
  },

  selectedLaneId: null,
  setSelectedLaneId: (id) => set({ selectedLaneId: id }),
  toggleLaneClosed: (laneId) => {
    const s = get().sim;
    const lane = s.network.lanes.get(laneId);
    if (!lane) return;
    if (lane.closed) {
      // find and clear existing renovation events for this lane
      const ren = Array.from(s.renovations.values()).find((r) => r.laneId === laneId);
      if (ren) s.clearRenovation(ren.id);
    } else {
      const ev: RenovationEvent = { id: `ren-${Date.now()}`, laneId, clearsAt: null };
      s.addRenovation(ev);
    }
    set({
      events: {
        ...get().events,
        renovations: Array.from(s.renovations.values()),
      },
    });
  },
}));

function buildChatSystemContext(
  sim: Simulation,
  mode: ControllerMode,
  kpi: KPISnapshot,
): string {
  const intersections = sim.network.intersectionList.map((i) => {
    const q = { N: 0, S: 0, E: 0, W: 0 } as Record<string, number>;
    for (const dir of ["N", "S", "E", "W"] as const) {
      for (const lid of i.approaches[dir]) {
        const cars = sim.laneCars.get(lid) ?? [];
        for (const c of cars) if (c.v < 0.5) q[dir]++;
      }
    }
    return `- ${i.id} (${i.label}): light phase ${i.light.phase}/${i.light.state} (t=${i.light.timer.toFixed(1)}s), queues N=${q.N} S=${q.S} E=${q.E} W=${q.W}`;
  }).join("\n");

  const accidents = Array.from(sim.accidents.values()).map((a) => `- ACCIDENT on ${a.laneId}`).join("\n") || "- none";
  const renovations = Array.from(sim.renovations.values()).map((r) => `- RENOVATION closed ${r.laneId}`).join("\n") || "- none";

  return [
    `You are a traffic-planning assistant for Yerevan's Davitashen -> Zeytun corridor demo.`,
    `Your goal: help the human planner diagnose congestion and suggest targeted improvements (signal timing, lane additions, turning restrictions, bus lanes, etc.).`,
    `Be concise (under 120 words), concrete, and grounded in the current state.`,
    ``,
    `CONTROLLER MODE: ${mode}`,
    `KPIs: avg wait=${kpi.avgWait.toFixed(1)}s | throughput=${kpi.throughput} cars/min | total queued=${kpi.totalQueue} | finished=${kpi.finished}`,
    ``,
    `INTERSECTIONS:`,
    intersections,
    ``,
    `ACTIVE EVENTS:`,
    accidents,
    renovations,
  ].join("\n");
}
