import type { WireLogEntry } from "../state/missionState";

interface LiveWireLogDrawerProps {
  open: boolean;
  entries: WireLogEntry[];
  onClose: () => void;
}

export function LiveWireLogDrawer({
  open,
  entries,
  onClose,
}: LiveWireLogDrawerProps) {
  if (!open) return null;

  return (
    <div
      className="overlay-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Live Wire Log"
      data-testid="live-wire-log-drawer"
    >
      <div className="drawer-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <div className="eyebrow">DETERMINISTIC PROBE TELEMETRY STREAM</div>
            <h2 style={{ margin: "4px 0 0", fontSize: "1.25rem", fontWeight: 800 }}>
              Live Wire Log ({entries.length} Events)
            </h2>
          </div>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="drawer-body">
          {entries.map((entry) => {
            const isOk = entry.httpStatus >= 200 && entry.httpStatus < 300;
            return (
              <div
                key={entry.id}
                className="wire-terminal"
                style={{ padding: "12px 14px" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#38bdf8", fontWeight: 800 }}>
                    [{entry.timestamp}] {entry.gate} · {entry.method} {entry.endpoint}
                  </span>
                  <span style={{ color: isOk ? "#4ade80" : "#fca5a5", fontWeight: 800 }}>
                    HTTP {entry.httpStatus} · {entry.latencyMs}ms
                  </span>
                </div>
                <div style={{ color: "#f8fafc", fontWeight: 700, marginTop: 4 }}>
                  {entry.summary}
                </div>
                {entry.details.map((line, i) => (
                  <div key={`${entry.id}-${i}`} style={{ color: "#94a3b8", fontSize: "0.74rem" }}>
                    ▸ {line}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
