// Davitashen Bridge → Komitas × Zeytun corridor — 4 real Yerevan intersections.
// Coordinates sourced from OSM Overpass API (verified node-by-node against CARTO basemap).
//
// I1 = Davitashen Bridge mid-span (OSM Way 41261023)
// I2 = Valley junction: Vagharsh Vagharshyan meets Aram Khachatryan St (OSM node)
// I3 = Aram Khachatryan descent rejoins Komitas Avenue western end (OSM node)
// I4 = Komitas Avenue × Zeytun approach (eastern end)
//
// The real corridor follows an S-curve:
//   Bridge descends SE (Vagharsh Vagharshyan St) → valley bottom (I2)
//   then climbs NE (Aram Khachatryan St) → peak ~40.2084 → descends SE back to Komitas (I3)
//   then follows Komitas Ave east, curving NE then SE again to I4.

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
    label: "Vagharshyan × Aram Khachatryan",
    lngLat: [44.4976, 40.2050],
  },
  {
    id: "I3",
    label: "Aram Khachatryan × Komitas",
    lngLat: [44.5075, 40.2065],
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
    // Davitashen Bridge → valley junction (Vagharsh Vagharshyan × Aram Khachatryan).
    // Follows OSM Way 41261023 (bridge, NW→SE) then Ways 515943719 + 221307820 +
    // 1292695709 + 570283514 + 1155227829 (Vagharsh Vagharshyan St) descending SE
    // to the valley bottom at I2. Total length ≈ 550 m.
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
    // Valley junction → Aram Khachatryan × Komitas.
    // Follows Aram Khachatryan St (OSM Ways 1215271102 + 23634990 + 30132181 +
    // 1215271091) climbing NE to peak lat ~40.2084 near lng 44.5062, then
    // descending SE back to Komitas Avenue at I3. Total length ≈ 800 m.
    waypoints: [
      [44.4976, 40.2050], // I2
      [44.4984, 40.2053], // AK start node (OSM 1215271102)
      [44.4996, 40.2058], // AK climb node
      [44.5006, 40.2062], // AK climb node
      [44.5020, 40.2068], // AK NE ascent node (OSM 23634990)
      [44.5043, 40.2077], // AK peak approach (OSM 30132181)
      [44.5062, 40.2084], // AK peak node
      [44.5070, 40.2073], // AK SE descent node (OSM 1215271091)
      [44.5075, 40.2065], // I3 — meets Komitas Avenue
    ],
  },
  {
    from: "I3",
    to: "I4",
    // Aram Khachatryan × Komitas → Komitas × Zeytun.
    // Follows Komitas Avenue east (OSM Way 481335956 + connecting ways).
    // Avenue curves NE (peak lat ~40.2070 near lng 44.5105) then bends SE to I4.
    waypoints: [
      [44.5075, 40.2065], // I3
      [44.5089, 40.2070], // Komitas NE curve start (OSM node)
      [44.5105, 40.2070], // Komitas peak latitude (OSM node)
      [44.5138, 40.2067], // Komitas SE return (OSM node)
      [44.5165, 40.2065], // Komitas approach to Zeytun (OSM node)
      [44.5180, 40.2066], // I4
    ],
  },
];

// Corridor view: centred on the midpoint of the full S-curve route,
// pitched to show the 3-D depth of the valley and NE climb.
export const CORRIDOR_CENTER: LngLat = [44.5010, 40.2065];
export const CORRIDOR_ZOOM = 15.4;
export const CORRIDOR_PITCH = 55;
export const CORRIDOR_BEARING = 20;
