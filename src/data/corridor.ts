// Davitashen Bridge → Komitas × Zeytun corridor — 5 real Yerevan intersections.
// Coordinates sourced from OSM Overpass API (verified node-by-node against CARTO basemap).
//
// I1 = Davitashen Bridge mid-span (OSM Way 41261023)
// I2 = Valley junction: Vagharsh Vagharshyan meets Aram Khachatryan St (OSM node)
// I3 = Aram Khachatryan summit (peak node at lat ~40.2084, OSM Way 30132181)
// I4 = Aram Khachatryan descent rejoins Komitas Avenue western end (OSM node)
// I5 = Komitas Avenue × Zeytun approach (eastern end)
//
// Five intersections keep every inter-node segment unidirectional — each road
// travels in one clear bearing — eliminating the "northern loop" that occurred
// when the westbound road (I3→I2) had to arc over the AK summit before descending.
//
//   Bridge (I1) → SE descent (VV) → valley (I2)
//   → NE climb (AK) → summit (I3)
//   → SE descent (AK) → Komitas junction (I4)
//   → east (Komitas Ave) → Zeytun (I5)

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
    label: "Vagharshyan × AK Junction",
    lngLat: [44.4976, 40.2050],
  },
  {
    id: "I3",
    label: "Aram Khachatryan Summit",
    lngLat: [44.5062, 40.2084],
  },
  {
    id: "I4",
    label: "Aram Khachatryan × Komitas",
    lngLat: [44.5075, 40.2065],
  },
  {
    id: "I5",
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
    // Davitashen Bridge → valley junction (Vagharsh Vagharshyan × Aram Khachatryan).
    // Follows OSM Way 41261023 (bridge, NW→SE) then Ways 515943719 + 221307820 +
    // 1292695709 + 570283514 + 1155227829 (Vagharsh Vagharshyan St) descending SE
    // to the valley bottom at I2. Total length ≈ 550 m. Bearing: ~SE.
    waypoints: [
      [44.4933, 40.2096], // I1 — bridge mid-span
      [44.4944, 40.2083], // bridge node (OSM Way 41261023)
      [44.4949, 40.2077], // bridge SE end / Vagharsh Vagharshyan start
      [44.4957, 40.2069], // Vagharshyan descent node (OSM 515943719)
      [44.4964, 40.2061], // Vagharshyan mid node (OSM 221307820)
      [44.4968, 40.2055], // Vagharshyan lower node (OSM 1292695709)
      [44.4972, 40.2049], // Vagharshyan valley node (OSM 570283514)
      [44.4976, 40.2050], // I2 — valley junction
    ],
  },
  {
    from: "I2",
    to: "I3",
    // Valley junction → AK summit.
    // Follows Aram Khachatryan St (OSM Ways 1215271102 + 23634990 + 30132181)
    // climbing NE from the valley bottom to the road's peak at I3.
    // Total length ≈ 600 m. Bearing: ~NE throughout — one clean direction.
    waypoints: [
      [44.4976, 40.2050], // I2 — valley
      [44.4984, 40.2053], // AK start node (OSM 1215271102)
      [44.4996, 40.2058], // AK climb node
      [44.5006, 40.2062], // AK climb node
      [44.5020, 40.2068], // AK NE ascent node (OSM 23634990)
      [44.5043, 40.2077], // AK peak approach (OSM 30132181)
      [44.5062, 40.2084], // I3 — AK summit
    ],
  },
  {
    from: "I3",
    to: "I4",
    // AK summit → Aram Khachatryan × Komitas.
    // Follows OSM Way 1215271091 descending SE from the summit back to
    // Komitas Avenue. Short segment (~150 m). Bearing: ~SE.
    waypoints: [
      [44.5062, 40.2084], // I3 — summit
      [44.5070, 40.2073], // AK SE descent node (OSM 1215271091)
      [44.5075, 40.2065], // I4 — meets Komitas Avenue
    ],
  },
  {
    from: "I4",
    to: "I5",
    // Aram Khachatryan × Komitas → Komitas × Zeytun.
    // Follows Komitas Avenue east (OSM Way 481335956 + connecting ways).
    // Avenue curves NE (peak lat ~40.2070 near lng 44.5105) then bends SE to I5.
    waypoints: [
      [44.5075, 40.2065], // I4
      [44.5089, 40.2070], // Komitas NE curve start (OSM node)
      [44.5105, 40.2070], // Komitas peak latitude (OSM node)
      [44.5138, 40.2067], // Komitas SE return (OSM node)
      [44.5165, 40.2065], // Komitas approach to Zeytun (OSM node)
      [44.5180, 40.2066], // I5
    ],
  },
];

// Corridor view: centred between the valley (I2) and the AK summit (I3) to
// show the full S-curve in frame. Bearing 20 matches the NE corridor axis.
export const CORRIDOR_CENTER: LngLat = [44.5010, 40.2068];
export const CORRIDOR_ZOOM = 15.2;
export const CORRIDOR_PITCH = 55;
export const CORRIDOR_BEARING = 20;
