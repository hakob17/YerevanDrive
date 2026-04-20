// Coordinate utilities. We render the simulation in Mercator meters with a
// per-scene origin, so that cars, lights, roads all live in a simple local
// Cartesian frame. Conversion back to lng/lat is only needed when we feed
// MapLibre's custom-layer matrix (done in the map layer module).

import type { LngLat } from "../data/corridor";

const EARTH_CIRC = 40075016.686; // meters at equator

export function lngLatToMeters(lng: number, lat: number): { x: number; y: number } {
  const x = (lng / 360) * EARTH_CIRC;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (EARTH_CIRC / (2 * Math.PI)) * 0.5 * Math.log((1 + sinLat) / (1 - sinLat));
  return { x, y };
}

export function metersToLngLat(x: number, y: number): LngLat {
  const lng = (x / EARTH_CIRC) * 360;
  const lat =
    ((2 * Math.atan(Math.exp((y * 2 * Math.PI) / EARTH_CIRC)) - Math.PI / 2) * 180) /
    Math.PI;
  return [lng, lat];
}

// Returns the "meters per Mercator meter" scale factor at a given latitude.
// Mercator stretches distances with latitude; at lat=0 this is 1.
export function metersPerMercMeter(lat: number): number {
  return 1 / Math.cos((lat * Math.PI) / 180);
}

export function unitVec(dx: number, dy: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

export function perp(v: { x: number; y: number }, rightHand = true): { x: number; y: number } {
  return rightHand ? { x: v.y, y: -v.x } : { x: -v.y, y: v.x };
}
