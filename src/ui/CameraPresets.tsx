import { useStore } from "../state/store";
import { CORRIDOR, CORRIDOR_BEARING, CORRIDOR_CENTER, CORRIDOR_PITCH, CORRIDOR_ZOOM } from "../data/corridor";

// Small presenter-mode control: jump the camera to each intersection or back to overview.
// We go through a custom window hook that MapView publishes so we don't have to drill
// the map ref through props.

declare global {
  interface Window {
    __map?: any;
  }
}

export function CameraPresets() {
  const jump = (center: [number, number], zoom: number, pitch = 60, bearing = 22) => {
    const m = window.__map;
    if (!m) return;
    m.flyTo({ center, zoom, pitch, bearing, duration: 1100, essential: true });
  };

  return (
    <div className="panel" style={{ position: "absolute", bottom: 18, left: 460, padding: "10px 12px", display: "flex", gap: 6, alignItems: "center" }}>
      <span className="slim" style={{ marginRight: 6 }}>jump to</span>
      <button onClick={() => jump(CORRIDOR_CENTER, CORRIDOR_ZOOM, CORRIDOR_PITCH, CORRIDOR_BEARING)}>
        Corridor
      </button>
      {CORRIDOR.map((c) => (
        <button key={c.id} onClick={() => jump(c.lngLat as [number, number], 17, 62, 22)} title={c.label}>
          {c.id}
        </button>
      ))}
    </div>
  );
}
