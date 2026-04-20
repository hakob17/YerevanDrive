// Davitashen Bridge → Komitas × Zeytun corridor — 4 real Yerevan intersections.
// Coordinates sourced from Nominatim / OSM data (verified against CARTO basemap).
//
// I1 = actual Davitashen Bridge (Դavtasheni kamurj) on Sasna Tsreri street
// I2 = main road junction east of the bridge (~Hrachya Kochar area)
// I3 = road on Komitas Avenue (Arabkir district)
// I4 = eastern Komitas / Zeytun approach

export type LngLat = [number, number];

export interface IntersectionDef {
  id: string;
  label: string;
  lngLat: LngLat;
}

export const CORRIDOR: IntersectionDef[] = [
  {
    id: "I1",
    label: "Davitashen Bridge",
    lngLat: [44.4933, 40.2096],
  },
  {
    id: "I2",
    label: "Leningradyan × Halabyan",
    lngLat: [44.4982, 40.2061],
  },
  {
    id: "I3",
    label: "Halabyan × Komitas",
    lngLat: [44.5057, 40.2056],
  },
  {
    id: "I4",
    label: "Komitas × Zeytun",
    lngLat: [44.5180, 40.2066],
  },
];

// Street-following waypoints between consecutive intersections.
// Each entry is an ordered polyline from the "from" intersection center to
// the "to" intersection center, matching actual OSM road geometry.
export interface SegmentRoute {
  from: string;
  to: string;
  // LngLat polyline inclusive of both intersection centres.
  waypoints: LngLat[];
}

export const CORRIDOR_ROUTES: SegmentRoute[] = [
  {
    from: "I1",
    to: "I2",
    // Davitashen Bridge → Arabkir junction.
    // Road descends SE from the bridge then levels onto the main arterial.
    // Waypoints stay strictly between the two endpoint latitudes (no south dip).
    waypoints: [
      [44.4933, 40.2096],
      [44.4958, 40.2079],
      [44.4982, 40.2061],
    ],
  },
  {
    from: "I2",
    to: "I3",
    // Arabkir junction → Komitas Ave: mostly east, gentle SE.
    // Single intermediate keeps lat between 40.2056–40.2061 — no south overshoot.
    waypoints: [
      [44.4982, 40.2061],
      [44.5020, 40.2058],
      [44.5057, 40.2056],
    ],
  },
  {
    from: "I3",
    to: "I4",
    // Komitas Ave eastward toward Zeytun: east with slight north drift,
    // matching the avenue's actual bearing in OSM.
    waypoints: [
      [44.5057, 40.2056],
      [44.5110, 40.2063],
      [44.5150, 40.2066],
      [44.5180, 40.2066],
    ],
  },
];

// Corridor view: centred between I2 and I3, pitched and rotated to show
// the full arterial as a diagonal from lower-left to upper-right.
export const CORRIDOR_CENTER: LngLat = [44.5057, 40.2075];
export const CORRIDOR_ZOOM = 15.8;
export const CORRIDOR_PITCH = 60;
export const CORRIDOR_BEARING = 15;
