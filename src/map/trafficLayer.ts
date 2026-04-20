// A MapLibre custom layer that renders the traffic simulation using Three.js.
// It owns:
//   - roads & lane paint (semi-transparent strips along lane polylines)
//   - stop-bar quads tinted by the current signal phase
//   - traffic-light poles (a small RGB indicator tuple per approach)
//   - cars (unit prisms translated/rotated to their current lane position)
//   - accident markers (red pulsing cone) and renovation overlays (striped quad)
//
// Lanes may have more than 2 points (polyline). All geometry and car-position
// logic uses arc-length interpolation along the full polyline.

import * as THREE from "three";
import maplibregl from "maplibre-gl";
import type { Network } from "../sim/network";
import type { Car, Lane } from "../sim/types";
import type { Simulation } from "../sim/simulation";

export interface TrafficLayerDeps {
  network: Network;
  sim: Simulation;
  onTick?: (dt: number, simTime: number) => void;
  onLaneClick?: (laneId: string) => void;
}

// ---------------------------------------------------------------------------
// Polyline helpers
// ---------------------------------------------------------------------------

interface PolyPt { x: number; y: number }
interface PolyResult { x: number; y: number; dx: number; dy: number }

/** Interpolate along a polyline at arc-length distance s from the start. */
function lerpPolyline(pts: PolyPt[], s: number): PolyResult {
  let rem = Math.max(0, s);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (rem <= segLen || i === pts.length - 2) {
      const t = segLen > 0 ? Math.min(1, rem / segLen) : 0;
      return { x: a.x + dx * t, y: a.y + dy * t, dx, dy };
    }
    rem -= segLen;
  }
  const last = pts[pts.length - 1], prev = pts[pts.length - 2] ?? last;
  return { x: last.x, y: last.y, dx: last.x - prev.x, dy: last.y - prev.y };
}

// ---------------------------------------------------------------------------
// Three.js helpers
// ---------------------------------------------------------------------------

function makeLaneStrip(
  a: PolyPt,
  b: PolyPt,
  width: number,
  mat: THREE.Material,
  yElevation: number,
): THREE.Mesh {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 0.01;
  const geom = new THREE.PlaneGeometry(len, width);
  geom.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set((a.x + b.x) / 2, yElevation, -(a.y + b.y) / 2);
  mesh.rotation.y = Math.atan2(dy, dx);
  return mesh;
}

// ---------------------------------------------------------------------------
// Main layer class
// ---------------------------------------------------------------------------

export class TrafficLayer implements maplibregl.CustomLayerInterface {
  id = "traffic-3d";
  type = "custom" as const;
  renderingMode = "3d" as const;

  private map!: maplibregl.Map;
  private camera!: THREE.Camera;
  private scene!: THREE.Scene;
  private renderer!: THREE.WebGLRenderer;
  private sceneTransform = new THREE.Matrix4();

  private deps: TrafficLayerDeps;
  private lastTime = performance.now();

  private carMeshes = new Map<number, THREE.Object3D>();
  private carGeometry!: THREE.BufferGeometry;
  private carMaterials = new Map<number, THREE.MeshStandardMaterial>();
  private lightBulbs: Array<{
    intersectionId: string;
    phase: "NS" | "EW";
    mesh: THREE.Mesh;
    material: THREE.MeshStandardMaterial;
  }> = [];

  // Lane click-testing: one entry per polyline sub-segment.
  private laneCenterlines: Array<{ laneId: string; a: THREE.Vector2; b: THREE.Vector2 }> = [];
  private selectedLaneId: string | null = null;
  private selectionGroup: THREE.Group | null = null;
  private closedLaneGroups = new Map<string, THREE.Group>();
  private accidentMarkers = new Map<string, THREE.Mesh>();

  constructor(deps: TrafficLayerDeps) {
    this.deps = deps;
  }

  onAdd(map: maplibregl.Map, gl: WebGL2RenderingContext | WebGLRenderingContext) {
    this.map = map;
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();

    const origin = maplibregl.MercatorCoordinate.fromLngLat(this.deps.network.originLngLat, 0);
    const scale = origin.meterInMercatorCoordinateUnits();
    this.sceneTransform
      .makeTranslation(origin.x, origin.y, origin.z)
      .scale(new THREE.Vector3(scale, -scale, scale))
      .multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2));

    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl as WebGL2RenderingContext,
      antialias: true,
    });
    this.renderer.autoClear = false;

    this.scene.add(new THREE.HemisphereLight(0xbfd6ff, 0x2a2f40, 0.9));
    const sun = new THREE.DirectionalLight(0xfff1d8, 1.25);
    sun.position.set(200, 400, 150);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.15));

    this.buildStaticGeometry();
    this.buildCarGeometry();
  }

  onRemove() {}

  private buildStaticGeometry() {
    const g = new THREE.Group();

    // Road paint — one strip per sub-segment of each lane polyline.
    for (const lane of this.deps.network.laneList) {
      const laneMat = new THREE.MeshStandardMaterial({
        color: lane.intersectionId == null ? 0x3a434f : 0x4a5060,
        transparent: true,
        opacity: 0.88,
        roughness: 0.95,
        metalness: 0,
      });
      for (let j = 0; j < lane.points.length - 1; j++) {
        const strip = makeLaneStrip(lane.points[j], lane.points[j + 1], 3.2, laneMat, 0.05);
        strip.userData.laneId = lane.id;
        g.add(strip);
        this.laneCenterlines.push({
          laneId: lane.id,
          a: new THREE.Vector2(lane.points[j].x, lane.points[j].y),
          b: new THREE.Vector2(lane.points[j + 1].x, lane.points[j + 1].y),
        });
      }
    }

    // Intersection pads.
    for (const inter of this.deps.network.intersectionList) {
      const padGeo = new THREE.CircleGeometry(14, 24);
      padGeo.rotateX(-Math.PI / 2);
      const pad = new THREE.Mesh(
        padGeo,
        new THREE.MeshStandardMaterial({ color: 0x353a44, opacity: 0.92, transparent: true, roughness: 1 }),
      );
      pad.position.set(inter.center.x, 0.04, -inter.center.y);
      g.add(pad);

      const labelSprite = makeTextSprite(inter.label, "#ffffff", "#0b1020cc");
      labelSprite.position.set(inter.center.x, 14, -inter.center.y);
      labelSprite.scale.set(34, 8.5, 1);
      g.add(labelSprite);

      for (const dir of ["N", "S", "E", "W"] as const) {
        const approachLanes = inter.approaches[dir];
        if (approachLanes.length === 0) continue;
        const firstLane = this.deps.network.lanes.get(approachLanes[0])!;
        // Stop-bar end of the lane (last point in the polyline).
        const b = firstLane.points[firstLane.points.length - 1];
        const a = firstLane.points[firstLane.points.length - 2] ?? firstLane.points[0];
        const dx = b.x - a.x, dy = b.y - a.y;
        const L = Math.hypot(dx, dy) || 1;
        const ux = dx / L, uy = dy / L;
        const poleX = b.x + uy * 5.5;
        const poleY = b.y - ux * 5.5;

        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.25, 0.25, 6.5, 12),
          new THREE.MeshStandardMaterial({ color: 0x1a1f2a, metalness: 0.6, roughness: 0.6 }),
        );
        pole.position.set(poleX, 3.25, -poleY);
        g.add(pole);

        const arm = new THREE.Mesh(
          new THREE.BoxGeometry(5.5, 0.25, 0.25),
          new THREE.MeshStandardMaterial({ color: 0x1a1f2a, metalness: 0.6, roughness: 0.6 }),
        );
        const armX = poleX + (-uy) * 2.75;
        const armY = poleY + ux * 2.75;
        arm.position.set(armX, 6.3, -armY);
        arm.rotation.y = Math.atan2(ux, -uy);
        g.add(arm);

        const housingX = poleX + (-uy) * 5;
        const housingY = poleY - (-ux) * 5;
        const housing = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 1.6, 0.6),
          new THREE.MeshStandardMaterial({ color: 0x0d1018, metalness: 0.3, roughness: 0.8 }),
        );
        housing.position.set(housingX, 5.8, -housingY);
        g.add(housing);

        const bulbPhase: "NS" | "EW" = dir === "N" || dir === "S" ? "NS" : "EW";
        const bulbMat = new THREE.MeshStandardMaterial({
          color: 0x222222,
          emissive: 0x000000,
          emissiveIntensity: 2.2,
        });
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), bulbMat);
        bulb.position.set(housingX, 5.8, -housingY);
        g.add(bulb);
        this.lightBulbs.push({ intersectionId: inter.id, phase: bulbPhase, mesh: bulb, material: bulbMat });
      }
    }

    // Corridor highlight ribbon — one strip per consecutive intersection pair.
    const inters = this.deps.network.intersectionList;
    for (let i = 0; i < inters.length - 1; i++) {
      const a = inters[i].center, b = inters[i + 1].center;
      const dx = b.x - a.x, dy = b.y - a.y;
      const L = Math.hypot(dx, dy);
      const geom = new THREE.PlaneGeometry(L, 18);
      geom.rotateX(-Math.PI / 2);
      const strip = new THREE.Mesh(
        geom,
        new THREE.MeshStandardMaterial({ color: 0x5aa7ff, transparent: true, opacity: 0.10, roughness: 1 }),
      );
      strip.position.set((a.x + b.x) / 2, 0.03, -(a.y + b.y) / 2);
      strip.rotation.y = Math.atan2(dy, dx);
      g.add(strip);
    }

    this.scene.add(g);
  }

  private buildCarGeometry() {
    this.carGeometry = new THREE.BoxGeometry(4.0, 2.6, 9.6);
    this.carGeometry.translate(0, 1.3, 0);
  }

  setSelectedLane(laneId: string | null) {
    this.selectedLaneId = laneId;
    if (this.selectionGroup) {
      this.scene.remove(this.selectionGroup);
      this.selectionGroup = null;
    }
    if (!laneId) return;
    const lane = this.deps.network.lanes.get(laneId);
    if (!lane) return;

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffd24a,
      transparent: true,
      opacity: 0.55,
      emissive: 0xffd24a,
      emissiveIntensity: 0.3,
    });
    const grp = new THREE.Group();
    for (let j = 0; j < lane.points.length - 1; j++) {
      grp.add(makeLaneStrip(lane.points[j], lane.points[j + 1], 3.6, mat, 0.12));
    }
    this.scene.add(grp);
    this.selectionGroup = grp;
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: any) {
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (dt > 0.08) dt = 0.08;
    this.deps.sim.tick(dt);
    if (this.deps.onTick) this.deps.onTick(dt, this.deps.sim.time);

    this.syncLights();
    this.syncClosures();
    this.syncAccidents();
    this.syncCars();

    const mtx: number[] = Array.isArray(args)
      ? args
      : args.mainMatrix ?? args.defaultProjectionData?.mainMatrix ?? args.modelViewProjectionMatrix ?? args.matrix;
    const m = new THREE.Matrix4().fromArray(mtx);
    this.camera.projectionMatrix = m.multiply(this.sceneTransform);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
  }

  private syncLights() {
    for (const bulb of this.lightBulbs) {
      const inter = this.deps.network.intersections.get(bulb.intersectionId);
      if (!inter) continue;
      const phaseMatch = inter.light.phase === bulb.phase;
      let color = 0x551b1b, emissive = 0xff1f1f, intensity = 2.2;
      if (phaseMatch) {
        if (inter.light.state === "green") { color = 0x1b551f; emissive = 0x22ff44; }
        else if (inter.light.state === "yellow") { color = 0x554b1b; emissive = 0xffd60a; }
        else { color = 0x551b1b; emissive = 0xff3030; }
      } else {
        color = 0x3a1414; emissive = 0xff2020; intensity = 2.2;
      }
      bulb.material.color.setHex(color);
      bulb.material.emissive.setHex(emissive);
      bulb.material.emissiveIntensity = intensity;
    }
  }

  private syncClosures() {
    const seen = new Set<string>();
    for (const lane of this.deps.network.laneList) {
      if (!lane.closed) continue;
      seen.add(lane.id);
      if (this.closedLaneGroups.has(lane.id)) continue;
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffb95a, emissive: 0xffb95a, emissiveIntensity: 0.5,
        transparent: true, opacity: 0.55,
      });
      const grp = new THREE.Group();
      for (let j = 0; j < lane.points.length - 1; j++) {
        grp.add(makeLaneStrip(lane.points[j], lane.points[j + 1], 3.2, mat, 0.14));
      }
      this.scene.add(grp);
      this.closedLaneGroups.set(lane.id, grp);
    }
    for (const [id, grp] of Array.from(this.closedLaneGroups.entries())) {
      if (!seen.has(id)) {
        this.scene.remove(grp);
        this.closedLaneGroups.delete(id);
      }
    }
  }

  private syncAccidents() {
    const liveIds = new Set<string>();
    for (const ev of this.deps.sim.accidents.values()) {
      liveIds.add(ev.id);
      let mesh = this.accidentMarkers.get(ev.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.ConeGeometry(1.4, 3.4, 8),
          new THREE.MeshStandardMaterial({ color: 0xff5a6f, emissive: 0xff5a6f, emissiveIntensity: 0.9 }),
        );
        this.scene.add(mesh);
        this.accidentMarkers.set(ev.id, mesh);
      }
      const lane = this.deps.network.lanes.get(ev.laneId);
      if (!lane) continue;
      const pos = lerpPolyline(lane.points, ev.s);
      const pulse = 1 + 0.15 * Math.sin(this.deps.sim.time * 6);
      mesh.position.set(pos.x, 1.7 * pulse, -pos.y);
      mesh.rotation.y += 0.06;
    }
    for (const [id, mesh] of Array.from(this.accidentMarkers.entries())) {
      if (!liveIds.has(id)) {
        this.scene.remove(mesh);
        this.accidentMarkers.delete(id);
      }
    }
  }

  private syncCars() {
    const live = new Set<number>();
    for (const car of this.deps.sim.cars.values()) {
      live.add(car.id);
      let mesh = this.carMeshes.get(car.id);
      if (!mesh) {
        let mat = this.carMaterials.get(car.color);
        if (!mat) {
          mat = new THREE.MeshStandardMaterial({ color: car.color, metalness: 0.35, roughness: 0.5 });
          this.carMaterials.set(car.color, mat);
        }
        mesh = new THREE.Mesh(this.carGeometry, mat);
        this.scene.add(mesh);
        this.carMeshes.set(car.id, mesh);
      }
      const lane = this.deps.network.lanes.get(car.laneId);
      if (!lane) continue;
      const pos = lerpPolyline(lane.points, car.s);
      mesh.position.set(pos.x, 0.01, -pos.y);
      // Car long axis is +Z in Three-space. rotY(θ): sin θ = dx/L, cos θ = -dy/L.
      mesh.rotation.y = Math.atan2(pos.dx, -pos.dy);
    }
    for (const [id, mesh] of Array.from(this.carMeshes.entries())) {
      if (!live.has(id)) {
        this.scene.remove(mesh);
        this.carMeshes.delete(id);
      }
    }
  }

  pickLaneNear(px: number, py: number, maxDist = 8): string | null {
    let bestId: string | null = null;
    let bestD = maxDist;
    for (const c of this.laneCenterlines) {
      const d = distPointToSegment(px, py, c.a.x, c.a.y, c.b.x, c.b.y);
      if (d < bestD) { bestD = d; bestId = c.laneId; }
    }
    return bestId;
  }
}

function distPointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

function makeTextSprite(text: string, fg = "#fff", bg = "#0008"): THREE.Sprite {
  const pad = 10;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  ctx.font = "600 36px Inter, system-ui, sans-serif";
  const w = ctx.measureText(text).width;
  c.width = Math.ceil(w) + pad * 2;
  c.height = 46 + pad * 2;
  ctx.font = "600 36px Inter, system-ui, sans-serif";
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, c.width, c.height, 12);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, pad, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  return new THREE.Sprite(mat);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
