import { MapView } from "./map/MapView";
import { ControlPanel } from "./ui/ControlPanel";
import { KPIPanel } from "./ui/KPIPanel";
import { ChatPanel } from "./ui/ChatPanel";
import { CameraPresets } from "./ui/CameraPresets";

export function App() {
  return (
    <div className="app">
      <MapView />

      <div className="panel brand">
        <span className="sub">Yerevan · Urban Mobility Demo</span>
        <span className="title">Smart Traffic Planner</span>
        <span className="slim">Davitashen → Zeytun corridor · camera-orchestrated signals</span>
      </div>

      <ControlPanel />
      <ChatPanel />
      <KPIPanel />
      <CameraPresets />

      <div className="legend panel" style={{ padding: "10px 12px" }}>
        <div className="item">
          <span className="dot" style={{ background: "#5ae38a" }} /> green phase
        </div>
        <div className="item">
          <span className="dot" style={{ background: "#ffd24a" }} /> yellow / transition
        </div>
        <div className="item">
          <span className="dot" style={{ background: "#ff5a6f" }} /> red / blocked
        </div>
        <div className="item">
          <span className="dot" style={{ background: "#ffb95a" }} /> lane closure (renovation)
        </div>
      </div>
    </div>
  );
}
