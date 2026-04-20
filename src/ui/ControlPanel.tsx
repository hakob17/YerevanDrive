import { useStore } from "../state/store";

export function ControlPanel() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const demand = useStore((s) => s.demandScale);
  const setDemand = useStore((s) => s.setDemandScale);
  const reset = useStore((s) => s.resetSim);
  const events = useStore((s) => s.events);
  const clearAllEvents = useStore((s) => s.clearAllEvents);
  const selectedLaneId = useStore((s) => s.selectedLaneId);
  const addAccident = useStore((s) => s.addAccident);
  const addRenovation = useStore((s) => s.addRenovation);
  const toggleLaneClosed = useStore((s) => s.toggleLaneClosed);
  const sim = useStore((s) => s.sim);

  const selLane = selectedLaneId ? sim.network.lanes.get(selectedLaneId) : null;

  return (
    <div className="panel controls">
      <h3>Controller</h3>
      <div className="modegroup">
        <button className={mode === "fixed" ? "active" : ""} onClick={() => setMode("fixed")}>
          Fixed timing
        </button>
        <button className={mode === "smart" ? "active" : ""} onClick={() => setMode("smart")}>
          Smart (AI)
        </button>
      </div>

      <div className="divider" />

      <h3>Demand</h3>
      <input
        type="range"
        min={0.4}
        max={2.5}
        step={0.05}
        value={demand}
        onChange={(e) => setDemand(parseFloat(e.target.value))}
      />
      <div className="row">
        <span className="label">traffic level</span>
        <span className="value">{demand.toFixed(2)}×</span>
      </div>

      <div className="divider" />

      <h3>Events</h3>
      <div className="event-buttons">
        <button
          disabled={!selectedLaneId}
          onClick={() => selectedLaneId && addAccident(selectedLaneId)}
          title={selectedLaneId ? "Inject a 90s accident on the selected lane" : "Click a lane on the map first"}
        >
          🚨 Accident
        </button>
        <button
          disabled={!selectedLaneId}
          onClick={() => selectedLaneId && addRenovation(selectedLaneId)}
          title={selectedLaneId ? "Close selected lane for renovation (3 min)" : "Click a lane on the map first"}
        >
          🚧 Renovation
        </button>
        <button
          disabled={!selectedLaneId}
          onClick={() => selectedLaneId && toggleLaneClosed(selectedLaneId)}
        >
          {selLane?.closed ? "Reopen lane" : "Toggle lane closure"}
        </button>
        <button className="danger" onClick={clearAllEvents}>
          Clear all
        </button>
      </div>
      <div className="slim" style={{ marginTop: 6 }}>
        {selectedLaneId ? (
          <>selected: <span className="tag">{selectedLaneId}</span></>
        ) : (
          "Tip: click a lane on the map to select it."
        )}
      </div>
      <div className="slim" style={{ marginTop: 4 }}>
        active: {events.accidents.length} accident(s), {events.renovations.length} closure(s)
      </div>

      <div className="divider" />

      <div className="row">
        <button onClick={reset}>↺ Reset simulation</button>
      </div>
    </div>
  );
}
