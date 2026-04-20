import { useStore } from "../state/store";

export function KPIPanel() {
  const kpi = useStore((s) => s.kpi);
  const baseline = useStore((s) => s.baselineKPI);
  const mode = useStore((s) => s.mode);
  const history = useStore((s) => s.kpiHistory);

  const delta = baseline && mode === "smart"
    ? {
        avgWait: kpi.avgWait - baseline.avgWait,
        throughput: kpi.throughput - baseline.throughput,
        totalQueue: kpi.totalQueue - baseline.totalQueue,
      }
    : null;

  return (
    <div className="panel kpis">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <h2>Live traffic KPIs</h2>
          <div className="slim">
            Rolling 60-second window · controller <span className="tag">{mode}</span>
          </div>
        </div>
        <div>
          <span className={"pill " + (kpi.totalQueue > 40 ? "bad" : kpi.totalQueue > 20 ? "warn" : "good")}>
            {kpi.totalQueue > 40 ? "congested" : kpi.totalQueue > 20 ? "heavy" : "flowing"}
          </span>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard
          value={kpi.avgWait.toFixed(1)}
          unit="sec avg wait"
          delta={delta?.avgWait}
          goodIfDown
        />
        <KpiCard
          value={String(kpi.throughput)}
          unit="cars/min throughput"
          delta={delta?.throughput}
        />
        <KpiCard
          value={String(kpi.totalQueue)}
          unit="queued cars"
          delta={delta?.totalQueue}
          goodIfDown
        />
      </div>

      <div style={{ marginTop: 10 }}>
        <Sparkline data={history.map((h) => h.totalQueue)} />
      </div>
    </div>
  );
}

function KpiCard({
  value,
  unit,
  delta,
  goodIfDown,
}: {
  value: string;
  unit: string;
  delta?: number;
  goodIfDown?: boolean;
}) {
  let deltaStr = "";
  let cls = "";
  if (delta != null && Math.abs(delta) > 0.01) {
    const up = delta > 0;
    const good = goodIfDown ? !up : up;
    deltaStr = `${up ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)} vs fixed`;
    cls = good ? "down" : "up";
  }
  return (
    <div className="kpi-card">
      <div className="v">{value}</div>
      <div className="u">{unit}</div>
      <div className={"d " + cls}>{deltaStr}</div>
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return <div className="slim">collecting data…</div>;
  const w = 380;
  const h = 40;
  const max = Math.max(5, ...data);
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline fill="none" stroke="#5aa7ff" strokeWidth={1.6} points={pts} />
      <polyline
        fill="rgba(90,167,255,0.12)"
        stroke="none"
        points={`0,${h} ${pts} ${w},${h}`}
      />
    </svg>
  );
}
