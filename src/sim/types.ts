// Core simulation types.
//
// The network is a graph of intersections connected by directed approaches.
// Each approach has 1+ lanes. Cars travel along approaches toward an
// intersection, queue if the light is red, then cross and continue on the
// outgoing approach of the next segment.

export type Direction = "N" | "S" | "E" | "W";

export type Phase = "NS" | "EW";

export type LightState = "green" | "yellow" | "red";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// A lane is a directed path from its start point to the stop bar at an
// intersection (or to an exit). points[] is the polyline in local metric
// coordinates (MapLibre mercator meters relative to the scene origin).
export interface Lane {
  id: string;
  roadId: string;
  intersectionId: string | null; // null = exits the corridor
  approachDir: Direction; // direction the cars are TRAVELING (i.e. into the intersection)
  laneIndex: number; // 0 = innermost
  points: { x: number; y: number }[]; // polyline from entry to stop bar
  length: number; // meters
  speedLimit: number; // m/s
  closed?: boolean; // if true, no cars can enter (e.g. renovation)
}

export interface Intersection {
  id: string;
  label: string;
  center: { x: number; y: number };
  // Incoming approach lane ids grouped by direction
  approaches: Record<Direction, string[]>;
  // How each approach connects to the next (outgoing lane id or null to exit)
  exits: Record<Direction, string | null>;
  light: TrafficLight;
}

export interface TrafficLight {
  phase: Phase;
  state: LightState;
  // seconds remaining in current state
  timer: number;
  // config
  greenTime: number; // seconds
  yellowTime: number; // seconds
}

export interface Car {
  id: number;
  laneId: string;
  s: number; // distance along current lane from entry (meters)
  v: number; // current speed (m/s)
  desiredV: number; // target cruise speed (m/s)
  route: string[]; // remaining lane ids after current one
  spawnTime: number; // ms sim time
  waitTime: number; // accumulated seconds with v<0.5
  color: number; // hex
  finished?: boolean;
}

export interface SpawnSource {
  id: string;
  laneId: string; // lane cars spawn onto
  rate: number; // cars per minute
  accumulator: number; // internal
  // a route template to follow (list of lane ids)
  route: string[];
  // optional dynamic overrides
  boost?: number;
}

export interface AccidentEvent {
  id: string;
  laneId: string;
  s: number; // meters from entry where the accident sits
  clearsAt: number; // sim time ms when it resolves
}

export interface RenovationEvent {
  id: string;
  laneId: string;
  clearsAt: number | null; // null = ongoing
}

export type ControllerMode = "fixed" | "smart";

export interface KPISnapshot {
  t: number; // sim time seconds
  avgWait: number; // seconds
  throughput: number; // cars/min (rolling)
  totalQueue: number; // cars currently stopped
  finished: number; // cumulative cars that completed route
}
