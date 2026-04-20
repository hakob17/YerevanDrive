// The main simulation engine. A single Simulation instance owns the network,
// the set of live cars, and the set of active events. `tick(dt)` advances
// the simulation by `dt` seconds.
//
// Car physics: a simplified car-following model. Each car tries to reach its
// desired speed, subject to:
//   - safe distance from the car ahead on the same lane
//   - stopping at the stop bar if the light is red or yellow
//   - stopping behind an accident blocking the lane
//
// Lane changes: not modeled. Lane 0 is used for routing; lane 1 exists only
// for visual parallel rendering of oncoming traffic inside an approach.

import type {
  AccidentEvent,
  Car,
  ControllerMode,
  Direction,
  KPISnapshot,
  Lane,
  RenovationEvent,
  SpawnSource,
  TrafficLight,
} from "./types";
import type { Network } from "./network";
import { runOrchestrator } from "./orchestrator";

const CAR_MIN_GAP = 6; // meters bumper-to-bumper
const CAR_MAX_ACCEL = 2.2; // m/s^2
const CAR_MAX_DECEL = 3.8; // m/s^2
const CAR_DESIRED_V = 12; // m/s (~43 km/h)
const STOP_BAR_MARGIN = 2; // meters before the actual stop bar

const CAR_COLORS = [
  0xf0f2f6, // white
  0x1e1e22, // dark
  0x3457d5, // blue
  0xd13636, // red
  0x6a6e76, // silver
  0xd1a13a, // gold
  0x1b7a3f, // green
];

export class Simulation {
  readonly network: Network;
  cars = new Map<number, Car>();
  laneCars = new Map<string, Car[]>(); // lane id -> cars sorted by s ascending
  accidents = new Map<string, AccidentEvent>();
  renovations = new Map<string, RenovationEvent>();

  mode: ControllerMode = "fixed";
  time = 0; // seconds
  private nextCarId = 1;
  private finished = 0;
  private finishedRecent: number[] = []; // timestamps (seconds) of recent completions for throughput window
  private waitSum = 0;
  private waitN = 0;
  private rng = mulberry32(0xc0ffee);

  // demand scale multiplier (0.5 = light traffic, 2 = heavy)
  demandScale = 1;

  constructor(network: Network) {
    this.network = network;
    for (const lane of network.laneList) this.laneCars.set(lane.id, []);
  }

  setMode(m: ControllerMode) {
    this.mode = m;
    // Reset light cycles cleanly
    for (const inter of this.network.intersectionList) {
      inter.light.phase = "EW";
      inter.light.state = "green";
      inter.light.timer = inter.light.greenTime;
    }
    // Reset KPI accumulators so the new controller's performance is measured cleanly
    // (throughput is already a 60s rolling window — this clears avg-wait history too).
    this.waitSum = 0;
    this.waitN = 0;
  }

  reset() {
    this.cars.clear();
    for (const lane of this.network.laneList) this.laneCars.set(lane.id, []);
    this.accidents.clear();
    this.renovations.clear();
    this.time = 0;
    this.finished = 0;
    this.finishedRecent = [];
    this.waitSum = 0;
    this.waitN = 0;
  }

  addAccident(ev: AccidentEvent) {
    this.accidents.set(ev.id, ev);
  }
  clearAccident(id: string) {
    this.accidents.delete(id);
  }
  addRenovation(ev: RenovationEvent) {
    this.renovations.set(ev.id, ev);
    const lane = this.network.lanes.get(ev.laneId);
    if (lane) lane.closed = true;
  }
  clearRenovation(id: string) {
    const ev = this.renovations.get(id);
    if (!ev) return;
    const lane = this.network.lanes.get(ev.laneId);
    if (lane) lane.closed = false;
    this.renovations.delete(id);
  }

  tick(dt: number) {
    this.time += dt;

    // 1) Update traffic lights
    for (const inter of this.network.intersectionList) {
      if (this.mode === "fixed") this.updateLightFixed(inter.light, dt);
      // smart mode is handled in a batch after collecting queues below
    }

    if (this.mode === "smart") {
      runOrchestrator(this.network, this.laneCars, dt);
    }

    // 2) Spawn new cars
    for (const source of this.network.spawns) {
      const effectiveRate = source.rate * (source.boost ?? 1) * this.demandScale;
      source.accumulator += (effectiveRate / 60) * dt; // cars per second
      while (source.accumulator >= 1) {
        source.accumulator -= 1;
        this.spawnCar(source);
      }
    }

    // 3) Step cars
    const completed: number[] = [];
    for (const car of this.cars.values()) {
      const lane = this.network.lanes.get(car.laneId);
      if (!lane) {
        completed.push(car.id);
        continue;
      }
      this.stepCar(car, lane, dt, completed);
    }
    for (const id of completed) {
      const car = this.cars.get(id);
      if (car) this.removeCarFromLane(car);
      this.cars.delete(id);
    }

    // 4) Resolve accident clearance
    for (const ev of this.accidents.values()) {
      if (this.time * 1000 >= ev.clearsAt) this.clearAccident(ev.id);
    }
    for (const ev of this.renovations.values()) {
      if (ev.clearsAt != null && this.time * 1000 >= ev.clearsAt) this.clearRenovation(ev.id);
    }

    // 5) Trim rolling throughput window (last 60s)
    const cutoff = this.time - 60;
    while (this.finishedRecent.length && this.finishedRecent[0] < cutoff) this.finishedRecent.shift();
  }

  private updateLightFixed(light: TrafficLight, dt: number) {
    light.timer -= dt;
    if (light.timer > 0) return;
    if (light.state === "green") {
      light.state = "yellow";
      light.timer = light.yellowTime;
    } else if (light.state === "yellow") {
      light.state = "green";
      light.phase = light.phase === "NS" ? "EW" : "NS";
      light.timer = light.greenTime;
    }
  }

  private spawnCar(source: SpawnSource) {
    const lane = this.network.lanes.get(source.laneId);
    if (!lane || lane.closed) return;
    // Don't spawn if the back of the lane already has a car near the entry
    const cars = this.laneCars.get(lane.id)!;
    for (const c of cars) if (c.s < CAR_MIN_GAP + 1) return;
    const color = CAR_COLORS[Math.floor(this.rng() * CAR_COLORS.length)];
    const car: Car = {
      id: this.nextCarId++,
      laneId: lane.id,
      s: 0,
      v: lane.speedLimit * 0.6,
      desiredV: CAR_DESIRED_V,
      route: source.route.slice(),
      spawnTime: this.time * 1000,
      waitTime: 0,
      color,
    };
    this.cars.set(car.id, car);
    this.insertCarIntoLane(car);
  }

  private insertCarIntoLane(car: Car) {
    const arr = this.laneCars.get(car.laneId);
    if (!arr) return;
    // maintain sorted by s ascending
    let i = 0;
    while (i < arr.length && arr[i].s < car.s) i++;
    arr.splice(i, 0, car);
  }

  private removeCarFromLane(car: Car) {
    const arr = this.laneCars.get(car.laneId);
    if (!arr) return;
    const idx = arr.indexOf(car);
    if (idx >= 0) arr.splice(idx, 1);
  }

  private stepCar(car: Car, lane: Lane, dt: number, completed: number[]) {
    // Find leader (next car ahead on same lane)
    const arr = this.laneCars.get(lane.id)!;
    const idx = arr.indexOf(car);
    const leader = idx >= 0 && idx < arr.length - 1 ? arr[idx + 1] : null;

    // Compute max allowed position this tick based on leader and light/events.
    const stopTarget = this.computeStopTarget(car, lane, leader);

    // Simple kinematic model:
    // if stopTarget distance > some threshold, accelerate toward desiredV
    // else decelerate to not overshoot stopTarget.
    const distToStop = stopTarget - car.s;
    let targetV: number;
    if (distToStop <= 0.2) {
      targetV = 0;
    } else {
      // v^2 = 2 * a * d -> v = sqrt(2*a*d)
      const brakeV = Math.sqrt(2 * CAR_MAX_DECEL * Math.max(0, distToStop - 0.5));
      targetV = Math.min(car.desiredV, lane.speedLimit, brakeV);
    }

    if (car.v < targetV) {
      car.v = Math.min(targetV, car.v + CAR_MAX_ACCEL * dt);
    } else if (car.v > targetV) {
      car.v = Math.max(targetV, car.v - CAR_MAX_DECEL * dt);
    }
    if (car.v < 0) car.v = 0;

    const newS = car.s + car.v * dt;
    // Clamp to stopTarget so we never actually overshoot in a single tick.
    car.s = Math.min(newS, stopTarget);

    if (car.v < 0.5) {
      car.waitTime += dt;
    }

    // Has the car reached end of this lane?
    if (car.s >= lane.length - 0.1) {
      // Are we allowed to transition yet?
      // If this lane enters an intersection (intersectionId != null), the light must be green
      // and the car must be at the stop bar. We proceed if light is green for this approach.
      if (lane.intersectionId != null) {
        const inter = this.network.intersections.get(lane.intersectionId)!;
        const phaseNeeded: "NS" | "EW" = lane.approachDir === "N" || lane.approachDir === "S" ? "NS" : "EW";
        if (inter.light.phase !== phaseNeeded || inter.light.state !== "green") {
          // Can't cross; remain at stop bar.
          car.s = lane.length - 0.5;
          return;
        }
      }
      // Transition to next lane
      this.removeCarFromLane(car);
      const nextLaneId = car.route.shift();
      if (!nextLaneId) {
        // Exited corridor
        this.finished++;
        this.finishedRecent.push(this.time);
        this.waitSum += car.waitTime;
        this.waitN += 1;
        completed.push(car.id);
        return;
      }
      const nextLane = this.network.lanes.get(nextLaneId);
      if (!nextLane) {
        completed.push(car.id);
        return;
      }
      car.laneId = nextLaneId;
      car.s = 0;
      this.insertCarIntoLane(car);
    }
  }

  private computeStopTarget(car: Car, lane: Lane, leader: Car | null): number {
    // Default: no hard stop — let the car cruise and transition at the lane boundary.
    // We still cap at lane.length + small margin so we don't overshoot transitions by a lot.
    let target = lane.length + 3;

    // Light-based stop: if lane ends at an intersection and the light isn't green for
    // this approach, halt a couple of meters before the stop bar.
    if (lane.intersectionId != null) {
      const inter = this.network.intersections.get(lane.intersectionId)!;
      const phaseNeeded: "NS" | "EW" = lane.approachDir === "N" || lane.approachDir === "S" ? "NS" : "EW";
      const green = inter.light.phase === phaseNeeded && inter.light.state === "green";
      if (!green) {
        target = Math.min(target, lane.length - STOP_BAR_MARGIN);
      }
    }

    // Accident blockage on this lane
    for (const ev of this.accidents.values()) {
      if (ev.laneId === lane.id && ev.s > car.s) {
        target = Math.min(target, ev.s - 1.5);
      }
    }

    // Renovation closure (shouldn't normally get here as we don't spawn onto closed lanes)
    if (lane.closed) target = Math.min(target, 0);

    // Leader
    if (leader) {
      target = Math.min(target, leader.s - CAR_MIN_GAP);
    }

    return target;
  }

  // ------------------------ KPIs ------------------------
  kpi(): KPISnapshot {
    const avgWait = this.waitN > 0 ? this.waitSum / this.waitN : 0;
    const throughput = this.finishedRecent.length; // finished cars in last 60s -> cars/min
    let totalQueue = 0;
    for (const car of this.cars.values()) if (car.v < 0.5) totalQueue++;
    return {
      t: this.time,
      avgWait,
      throughput,
      totalQueue,
      finished: this.finished,
    };
  }
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
