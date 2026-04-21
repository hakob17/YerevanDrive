// Build the simulation network from the Yerevan corridor definition.
//
// For each intersection we create 4 approaches (N, S, E, W). Main-axis
// approaches (E <-> W) form the corridor and chain between intersections.
// Cross-axis approaches (N <-> S) start and end at external spawn / sink
// points placed ~120m away from the intersection along the cross street.
//
// Each approach has 2 lanes in the simulation (inner + outer). In the current
// MVP we treat them interchangeably for demand purposes but they are
// visualized separately.

import type {
  Direction,
  Intersection,
  Lane,
  SpawnSource,
  TrafficLight,
} from "./types";
import { CORRIDOR, CORRIDOR_ROUTES, type IntersectionDef, type LngLat } from "../data/corridor";
import { lngLatToMeters, metersPerMercMeter, perp, unitVec } from "./geo";

export interface Network {
  originLngLat: [number, number];
  originMerc: { x: number; y: number };
  metersPerMerc: number;
  lanes: Map<string, Lane>;
  intersections: Map<string, Intersection>;
  spawns: SpawnSource[];
  // Rendering-friendly lists
  laneList: Lane[];
  intersectionList: Intersection[];
}

const CROSS_STUB_LENGTH = 140; // meters — length of N/S stub streets beyond each intersection
const LANE_WIDTH = 3.4; // meters, per lane offset
const APPROACH_OFFSET_FROM_CENTER = 11; // meters — stop bar offset from intersection center

function newLight(greenTime = 30, yellowTime = 3): TrafficLight {
  return {
    phase: "EW",
    state: "green",
    timer: greenTime,
    greenTime,
    yellowTime,
  };
}

function laneId(iid: string, dir: Direction, idx: number): string {
  return `${iid}:${dir}:L${idx}`;
}

function exitLaneId(iid: string, dir: Direction, idx: number): string {
  return `${iid}:${dir}:OUT${idx}`;
}

// Sum of distances between consecutive points.
function polylineLength(pts: { x: number; y: number }[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}

// Convert an array of LngLat waypoints to local-metre coordinates.
function toLocal(
  wps: LngLat[],
  originMerc: { x: number; y: number },
  metersPerMerc: number,
): { x: number; y: number }[] {
  return wps.map((ll) => {
    const m = lngLatToMeters(ll[0], ll[1]);
    return {
      x: (m.x - originMerc.x) / metersPerMerc,
      y: (m.y - originMerc.y) / metersPerMerc,
    };
  });
}

export function buildNetwork(): Network {
  const origin = CORRIDOR[0].lngLat;
  const originMerc = lngLatToMeters(origin[0], origin[1]);
  const metersPerMerc = metersPerMercMeter(origin[1]);

  const lanes = new Map<string, Lane>();
  const intersections = new Map<string, Intersection>();
  const spawns: SpawnSource[] = [];

  // Compute intersection centres in local metres.
  const centers = CORRIDOR.map((def: IntersectionDef) => {
    const m = lngLatToMeters(def.lngLat[0], def.lngLat[1]);
    return {
      def,
      x: (m.x - originMerc.x) / metersPerMerc,
      y: (m.y - originMerc.y) / metersPerMerc,
    };
  });

  // Pre-convert CORRIDOR_ROUTES waypoints to local metres first — we need
  // the polyline tangents in order to orient each intersection correctly.
  // Key: "I1>I2" → [{x,y}…]
  const routeMap = new Map<string, { x: number; y: number }[]>();
  for (const seg of CORRIDOR_ROUTES) {
    const key = `${seg.from}>${seg.to}`;
    routeMap.set(key, toLocal(seg.waypoints, originMerc, metersPerMerc));
    // Also store reversed route for the opposite direction.
    const revKey = `${seg.to}>${seg.from}`;
    routeMap.set(revKey, toLocal([...seg.waypoints].reverse(), originMerc, metersPerMerc));
  }

  // For each intersection, compute the forward (main-axis) direction vector.
  // Terminal intersections use centre-to-centre direction.
  // Intermediate intersections use the average of the road tangents:
  //   in-tangent  = last segment of the incoming route polyline
  //   out-tangent = first segment of the outgoing route polyline
  // This aligns stop bars with the actual street geometry instead of the
  // straight-line bearing between intersection centres.
  const forward: { x: number; y: number }[] = centers.map((c, i) => {
    const prevCenter = centers[i - 1];
    const nextCenter = centers[i + 1];

    if (!prevCenter || !nextCenter) {
      // Terminal: fall back to centre-to-centre.
      const prev = centers[i - 1] ?? centers[i];
      const next = centers[i + 1] ?? centers[i];
      return unitVec(next.x - prev.x, next.y - prev.y);
    }

    // In-tangent: direction of the last segment of the route arriving here.
    const inRoute = routeMap.get(`${prevCenter.def.id}>${c.def.id}`);
    let inDx = 0, inDy = 0;
    if (inRoute && inRoute.length >= 2) {
      const a = inRoute[inRoute.length - 2], b = inRoute[inRoute.length - 1];
      const d = unitVec(b.x - a.x, b.y - a.y);
      inDx = d.x; inDy = d.y;
    }

    // Out-tangent: direction of the first segment of the route departing here.
    const outRoute = routeMap.get(`${c.def.id}>${nextCenter.def.id}`);
    let outDx = 0, outDy = 0;
    if (outRoute && outRoute.length >= 2) {
      const a = outRoute[0], b = outRoute[1];
      const d = unitVec(b.x - a.x, b.y - a.y);
      outDx = d.x; outDy = d.y;
    }

    return unitVec(inDx + outDx, inDy + outDy);
  });

  // Build intersections.
  for (let i = 0; i < centers.length; i++) {
    const c = centers[i];
    const intersection: Intersection = {
      id: c.def.id,
      label: c.def.label,
      center: { x: c.x, y: c.y },
      approaches: { N: [], S: [], E: [], W: [] },
      exits: { N: null, S: null, E: null, W: null },
      light: newLight(),
    };
    intersections.set(intersection.id, intersection);
  }

  // Build main-axis (EW) approaches connecting successive intersections.
  for (let i = 0; i < centers.length; i++) {
    const c = centers[i];
    const fwd = forward[i];
    const right = perp(fwd, true);
    const iid = c.def.id;

    const westNeighbor = centers[i - 1];
    const eastNeighbor = centers[i + 1];

    // Waypoints for the E-bound approach at this intersection (coming from the west neighbor).
    const ewWaypoints = westNeighbor
      ? routeMap.get(`${westNeighbor.def.id}>${iid}`) ?? null
      : null;

    // Waypoints for the W-bound approach (coming from the east neighbor).
    const weWaypoints = eastNeighbor
      ? routeMap.get(`${eastNeighbor.def.id}>${iid}`) ?? null
      : null;

    buildApproach({
      lanes,
      intersections,
      iid,
      dir: "E",
      center: c,
      fwd,
      right,
      fromCenter: westNeighbor
        ? { x: westNeighbor.x, y: westNeighbor.y, isNeighbor: true, neighborId: westNeighbor.def.id }
        : externalFrom(c, fwd, -1, 220),
      offset: APPROACH_OFFSET_FROM_CENTER,
      routeWaypoints: ewWaypoints,
    });
    buildApproach({
      lanes,
      intersections,
      iid,
      dir: "W",
      center: c,
      fwd: { x: -fwd.x, y: -fwd.y },
      right: { x: -right.x, y: -right.y },
      fromCenter: eastNeighbor
        ? { x: eastNeighbor.x, y: eastNeighbor.y, isNeighbor: true, neighborId: eastNeighbor.def.id }
        : externalFrom(c, fwd, +1, 220),
      offset: APPROACH_OFFSET_FROM_CENTER,
      routeWaypoints: weWaypoints,
    });

    // N / S cross-street stubs (no waypoints — just straight 140 m stubs).
    const crossDir = { x: -right.x, y: -right.y };
    buildApproach({
      lanes, intersections, iid, dir: "N",
      center: c,
      fwd: { x: -crossDir.x, y: -crossDir.y },
      right: { x: -perp(crossDir, true).x, y: -perp(crossDir, true).y },
      fromCenter: externalFromVec(c, crossDir, +1, CROSS_STUB_LENGTH),
      offset: APPROACH_OFFSET_FROM_CENTER,
    });
    buildApproach({
      lanes, intersections, iid, dir: "S",
      center: c,
      fwd: crossDir,
      right: perp(crossDir, true),
      fromCenter: externalFromVec(c, crossDir, -1, CROSS_STUB_LENGTH),
      offset: APPROACH_OFFSET_FROM_CENTER,
    });
  }

  // Wire up exits.
  for (let i = 0; i < centers.length; i++) {
    const iid = centers[i].def.id;
    const inter = intersections.get(iid)!;
    const east = centers[i + 1]?.def.id ?? null;
    const west = centers[i - 1]?.def.id ?? null;
    inter.exits.E = east ? intersections.get(east)!.approaches.E[0] ?? null : null;
    inter.exits.W = west ? intersections.get(west)!.approaches.W[0] ?? null : null;
    inter.exits.N = null;
    inter.exits.S = null;
  }

  // Spawn sources.
  const firstId = centers[0].def.id;
  const lastId = centers[centers.length - 1].def.id;

  spawns.push(makeSpawn("west-end-eastbound", intersections, firstId, "E", centers.map((c) => c.def.id), 36));
  spawns.push(makeSpawn("east-end-westbound", intersections, lastId, "W", [...centers].reverse().map((c) => c.def.id), 28));

  for (const c of centers) {
    spawns.push(makeCrossSpawn(`${c.def.id}-cross-N`, intersections, c.def.id, "N", 10));
    spawns.push(makeCrossSpawn(`${c.def.id}-cross-S`, intersections, c.def.id, "S", 10));
  }

  return {
    originLngLat: origin,
    originMerc,
    metersPerMerc,
    lanes,
    intersections,
    spawns,
    laneList: Array.from(lanes.values()),
    intersectionList: Array.from(intersections.values()),
  };
}

interface BuildApproachArgs {
  lanes: Map<string, Lane>;
  intersections: Map<string, Intersection>;
  iid: string;
  dir: Direction;
  center: { x: number; y: number };
  fwd: { x: number; y: number };
  right: { x: number; y: number };
  fromCenter: { x: number; y: number; isNeighbor?: boolean; neighborId?: string };
  offset: number;
  // Optional: pre-converted polyline from previous intersection centre to this one.
  // Includes both endpoint centres. Intermediate points are used verbatim.
  routeWaypoints?: { x: number; y: number }[] | null;
}

function buildApproach(args: BuildApproachArgs) {
  const { lanes, intersections, iid, dir, center, fwd, right, fromCenter, offset, routeWaypoints } = args;
  const inter = intersections.get(iid)!;

  const stopX = center.x - fwd.x * offset;
  const stopY = center.y - fwd.y * offset;

  let startX = fromCenter.x;
  let startY = fromCenter.y;
  if (fromCenter.isNeighbor) {
    startX += fwd.x * offset;
    startY += fwd.y * offset;
  }

  // Extract intermediate waypoints from the route (strip the two endpoint centres).
  // The route runs from the neighbouring centre to this centre; we've already computed
  // startX/Y and stopX/Y accounting for the intersection box offsets.
  let intermediates: { x: number; y: number }[] = [];
  if (routeWaypoints && routeWaypoints.length > 2) {
    intermediates = routeWaypoints.slice(1, -1);
  }

  const laneCount = 2;
  const approachLaneIds: string[] = [];
  for (let idx = 0; idx < laneCount; idx++) {
    const offR = (idx + 0.5) * LANE_WIDTH;

    // Build offset polyline: start → intermediates → stop, all shifted right by offR.
    const pts: { x: number; y: number }[] = [
      { x: startX + right.x * offR, y: startY + right.y * offR },
      ...intermediates.map((p) => ({ x: p.x + right.x * offR, y: p.y + right.y * offR })),
      { x: stopX + right.x * offR, y: stopY + right.y * offR },
    ];

    // De-duplicate consecutive coincident points to avoid zero-length segments.
    const deduped = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 0.01);

    const length = polylineLength(deduped);
    const lane: Lane = {
      id: laneId(iid, dir, idx),
      roadId: `${iid}:${dir}`,
      intersectionId: iid,
      approachDir: dir,
      laneIndex: idx,
      points: deduped,
      length,
      speedLimit: 13.4,
    };
    lanes.set(lane.id, lane);
    approachLaneIds.push(lane.id);
  }
  inter.approaches[dir] = approachLaneIds;

  // Exit stubs: short straight stretches past the intersection.
  for (let idx = 0; idx < laneCount; idx++) {
    const offR = (idx + 0.5) * LANE_WIDTH;
    const startEX = center.x + fwd.x * offset + right.x * offR;
    const startEY = center.y + fwd.y * offset + right.y * offR;
    const stubLen = 60;
    const endEX = startEX + fwd.x * stubLen;
    const endEY = startEY + fwd.y * stubLen;
    const exitLane: Lane = {
      id: exitLaneId(iid, dir, idx),
      roadId: `${iid}:${dir}:exit`,
      intersectionId: null,
      approachDir: dir,
      laneIndex: idx,
      points: [{ x: startEX, y: startEY }, { x: endEX, y: endEY }],
      length: stubLen,
      speedLimit: 13.4,
    };
    lanes.set(exitLane.id, exitLane);
  }
}

function externalFrom(
  c: { x: number; y: number },
  fwd: { x: number; y: number },
  sign: number,
  length: number,
): { x: number; y: number } {
  return { x: c.x + fwd.x * length * sign, y: c.y + fwd.y * length * sign };
}

function externalFromVec(
  c: { x: number; y: number },
  v: { x: number; y: number },
  sign: number,
  length: number,
): { x: number; y: number } {
  return { x: c.x + v.x * length * sign, y: c.y + v.y * length * sign };
}

function makeSpawn(
  id: string,
  intersections: Map<string, Intersection>,
  startIid: string,
  dir: Direction,
  intersectionRoute: string[],
  rate: number,
): SpawnSource {
  const route: string[] = [];
  for (const iid of intersectionRoute) {
    const inter = intersections.get(iid);
    if (!inter) continue;
    route.push(inter.approaches[dir][0]);
  }
  const last = intersectionRoute[intersectionRoute.length - 1];
  route.push(exitLaneId(last, dir, 0));
  const entryLane = route[0];
  return { id, laneId: entryLane, rate, accumulator: 0, route: route.slice(1) };
}

function makeCrossSpawn(
  id: string,
  intersections: Map<string, Intersection>,
  iid: string,
  dir: Direction,
  rate: number,
): SpawnSource {
  const inter = intersections.get(iid)!;
  const entry = inter.approaches[dir][0];
  const opp: Direction = dir === "N" ? "S" : dir === "S" ? "N" : dir === "E" ? "W" : "E";
  const exitL = exitLaneId(iid, opp, 0);
  return { id, laneId: entry, rate, accumulator: 0, route: [exitL] };
}

export const _internal = { laneId, exitLaneId };
