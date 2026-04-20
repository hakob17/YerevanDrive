// Adaptive traffic-light orchestrator.
//
// Each intersection is controlled independently but uses demand data from
// "cameras" placed at the stop bar for each approach. The camera count is
// simply the number of cars stopped or approaching within a lookback window.
// Using this, the controller decides: (1) extend current green if the active
// direction has more demand, or (2) switch phase otherwise, respecting min
// green and max green constraints. A yellow phase always separates greens.
//
// This is deliberately simple but captures the essence of what a real
// SCATS/SCOOT system does. The win over fixed timing comes from favoring
// whichever direction has backed-up traffic at each intersection.

import type { Car, Direction, Intersection } from "./types";
import type { Network } from "./network";

const MIN_GREEN = 8; // seconds
const MAX_GREEN = 45; // seconds
const YELLOW = 3; // seconds
const DETECTION_LOOKBACK = 60; // meters — "camera" covers last 60m of approach

// Per-intersection controller state (timers outside the light itself).
const controllers = new WeakMap<Intersection, ControllerState>();

interface ControllerState {
  timeInState: number; // seconds since entering current state
  lastSwitchReason?: string;
}

function getState(inter: Intersection): ControllerState {
  let s = controllers.get(inter);
  if (!s) {
    s = { timeInState: 0 };
    controllers.set(inter, s);
  }
  return s;
}

export function runOrchestrator(
  network: Network,
  laneCars: Map<string, Car[]>,
  dt: number,
) {
  for (const inter of network.intersectionList) {
    const s = getState(inter);
    s.timeInState += dt;
    const light = inter.light;

    // Count "camera detections" per phase
    const ns = countDemand(inter, ["N", "S"], laneCars);
    const ew = countDemand(inter, ["E", "W"], laneCars);
    const activeDemand = light.phase === "NS" ? ns : ew;
    const otherDemand = light.phase === "NS" ? ew : ns;

    if (light.state === "green") {
      // Decide whether to extend or switch to yellow
      if (s.timeInState < MIN_GREEN) {
        // stay
      } else if (s.timeInState >= MAX_GREEN) {
        // force switch
        light.state = "yellow";
        light.timer = YELLOW;
        s.timeInState = 0;
        s.lastSwitchReason = "max-green";
      } else {
        // If other direction has significantly more demand AND there's at least one car waiting, switch.
        if (otherDemand > activeDemand + 1 && otherDemand >= 1) {
          light.state = "yellow";
          light.timer = YELLOW;
          s.timeInState = 0;
          s.lastSwitchReason = "demand-swing";
        } else if (activeDemand === 0 && otherDemand >= 1) {
          // nobody is using current green but someone is waiting
          light.state = "yellow";
          light.timer = YELLOW;
          s.timeInState = 0;
          s.lastSwitchReason = "idle-switch";
        }
        // else: keep green — serving the current direction
      }
    } else if (light.state === "yellow") {
      light.timer -= dt;
      if (light.timer <= 0) {
        light.state = "green";
        light.phase = light.phase === "NS" ? "EW" : "NS";
        s.timeInState = 0;
      }
    }
  }
}

function countDemand(
  inter: Intersection,
  dirs: Direction[],
  laneCars: Map<string, Car[]>,
): number {
  let count = 0;
  for (const dir of dirs) {
    for (const laneId of inter.approaches[dir]) {
      const cars = laneCars.get(laneId);
      if (!cars) continue;
      const lane = getLaneLength(laneId);
      for (const c of cars) {
        // Count cars within DETECTION_LOOKBACK meters of the stop bar.
        if (c.s >= lane - DETECTION_LOOKBACK) count++;
      }
    }
  }
  return count;
}

// Tiny cache of lane lengths via a module-level map populated lazily.
const laneLenCache = new Map<string, number>();
function getLaneLength(laneId: string): number {
  let v = laneLenCache.get(laneId);
  if (v != null) return v;
  // Populate on first miss via the global network accessor below.
  const net = _network;
  if (!net) return 0;
  v = net.lanes.get(laneId)?.length ?? 0;
  laneLenCache.set(laneId, v);
  return v;
}

let _network: Network | null = null;
export function bindOrchestratorNetwork(n: Network) {
  _network = n;
  laneLenCache.clear();
}
