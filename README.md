# Yerevan Smart Traffic Planner — demo

A visual pitch demo for camera-orchestrated traffic lights along the
**Davitashen → Zeytun** corridor in Yerevan.

Four intersections on a real Yerevan arterial are simulated in 3D on top of a
real-street-grid basemap. A controller watches "camera" counts at each
approach and chooses signal timings to minimise queues and total travel time.
A toggle switches between a naive **fixed-timing** controller (today's default)
and the **smart orchestrator** (proposed). KPIs update live.

## Running

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... npm run dev
```

The chat side panel ("Planning co-pilot") uses Claude via a tiny dev-server
proxy that reads `ANTHROPIC_API_KEY` from the environment. The key is never
sent to the browser. Without the key the rest of the demo still works; the
chat just returns an error message.

Open <http://localhost:5173> in a modern browser.

## What's in the demo

- **Real Yerevan base map** (OpenStreetMap streets via CARTO dark raster tiles)
- **3D simulation overlay** rendered with Three.js as a MapLibre custom layer
- **4 intersections** with independent traffic lights, each controlling N/S and
  E/W approaches with green / yellow / red phases
- **Car-following simulation** with queueing, reaction time, and stop-bar
  obedience — updates live at 30+ FPS
- **Two controllers**
  - *Fixed timing*: 30 s green + 3 s yellow, alternating NS/EW
  - *Smart (AI)*: uses live approach "camera counts" to decide when to
    extend, shorten, or switch the active green, respecting min-green /
    max-green / yellow guards
- **Live KPIs** — average wait time, throughput (cars/min, 60 s rolling),
  currently queued cars, historical queue sparkline
- **Event injection** — click a lane on the map, then trigger:
  - **Accident**: blocks the lane for 90 s
  - **Renovation**: closes the lane until reopened
  - **Toggle closure**: one-click open/close
- **Demand slider** — scale traffic from 0.4× to 2.5× real volume
- **Planning co-pilot** — free-form chat with Claude, grounded in the live
  simulation state (intersection queues, light phases, active events, KPIs)
- **Camera presets** — one-click jump between the corridor overview and each
  of the four intersections (I1–I4), for a clean pitch

## Architecture

```
 MapLibre GL (basemap + camera)
     └── custom layer ── Three.js scene ── cars / lights / roads / events
                         │
 Zustand store ──────────┘
     │
     ├── Simulation engine (60 Hz tick, car-following)
     ├── Fixed-timing controller
     └── Smart orchestrator (camera-driven)
```

Code layout:

- `src/data/corridor.ts` — coordinates of the Davitashen → Zeytun corridor
- `src/sim/network.ts` — builds the road graph (approaches, lanes, exits)
- `src/sim/simulation.ts` — the physics tick
- `src/sim/orchestrator.ts` — adaptive signal controller
- `src/map/MapView.tsx` — MapLibre setup and click-to-select lanes
- `src/map/trafficLayer.ts` — Three.js custom layer
- `src/ui/*` — UI panels (controls, KPIs, chat, camera presets)
- `src/state/store.ts` — Zustand store & Claude chat client
- `vite.config.ts` — includes a tiny `/api/chat` proxy to Anthropic

## Pitch script

1. Open on **Corridor** view; mention that this is the Davitashen → Zeytun
   arterial with four real intersections.
2. Show the **Fixed-timing** KPIs for ~30 seconds — note the growing queues
   (congestion pill turns red) as the demand slider is raised.
3. Toggle **Smart (AI)**. KPIs reset cleanly; watch throughput climb and
   queues shrink.
4. Click a corridor lane on the map, hit **Accident** — point out how the
   smart controller routes around the bottleneck while fixed-timing
   would not have adapted.
5. Zoom to **I2** with the preset button to show the intersection up close
   (cars queued at the red, crossing when green, following lane geometry).
6. Ask the **co-pilot** a question — e.g. "Which intersection is hurting
   throughput most right now?" — to show AI-driven planning suggestions
   grounded in live state.

## Next steps (not in this demo)

- Real camera feeds: swap simulated counts for YOLO vehicle counts from RTSP
  streams
- Green-wave coordination between intersections (platoon progression)
- Pedestrian phases & bus-priority signals
- Import real OSM road geometry for arbitrary corridors
- Export signal timing plans in SCATS / NTCIP format for real controllers
