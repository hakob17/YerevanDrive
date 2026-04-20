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
    // Davitashen Bridge → Leningradyan × Halabyan.
    // Road follows OSM Way 41261023 (bridge) then Ways 515943719 + 221307820
    // (Vagharsh Vagharshyan street) descending SE to the Arabkir junction.
    // All intermediates are actual OSM node coordinates.
    waypoints: [
      [44.4933, 40.2096], // I1 — on bridge (~mid-span)
      [44.4944, 40.2083], // bridge node (OSM 41261023 mid)
      [44.4949, 40.2077], // bridge SE end / Vagharsh Vagharshyan start
      [44.4957, 40.2069], // Vagharsh Vagharshyan (OSM 515943719 node)
      [44.4964, 40.2061], // Vagharsh Vagharshyan (OSM 221307820) — reaches I2 lat
      [44.4982, 40.2061], // I2
    ],
  },
  {
    from: "I2",
    to: "I3",
    // Leningradyan × Halabyan → Halabyan × Komitas: follows Halabyan street east.
    // Nearly flat — lat drops only ~5 m over 565 m horizontal.
    waypoints: [
      [44.4982, 40.2061],
      [44.5020, 40.2058],
      [44.5057, 40.2056],
    ],
  },
  {
    from: "I3",
    to: "I4",
    // Halabyan × Komitas → Komitas × Zeytun: follows Komitas Avenue east.
    // The avenue curves NE first (peak lat ~40.2070 near lng 44.5105) then
    // bends SE back to I4. Intermediates from OSM Way 481335956 nodes.
    waypoints: [
      [44.5057, 40.2056], // I3
      [44.5075, 40.2065], // Komitas NE curve starts (OSM node)
      [44.5105, 40.2070], // Komitas peak latitude (OSM node)
      [44.5138, 40.2067], // Komitas SE return (OSM node)
      [44.5180, 40.2066], // I4
    ],
  },
];

// Corridor view: centred on the I2-I3 midpoint, pitched to show the full
// arterial. Bearing ~20 matches the corridor's overall NE orientation.
export const CORRIDOR_CENTER: LngLat = [44.5065, 40.2063];
export const CORRIDOR_ZOOM = 15.6;
export const CORRIDOR_PITCH = 55;
export const CORRIDOR_BEARING = 20;
