import { useEffect, useRef, useState } from "react";
import {
  evaluateWaivers,
  GATE1_SUB_STAGES,
  type AccountPreset,
  type CustomStationConfig,
  type FlightCheckResult,
  type StationCode,
  type StationResult,
  type WaiverInput,
} from "@nominalx/core";
import { ShieldLockIcon, StationGlyph } from "./Icons";

interface Gate1FlightCheckProps {
  preset: AccountPreset;
  customStations: readonly CustomStationConfig[];
  flightCheck: FlightCheckResult;
  selectedStation: StationCode;
  sweepingIndex: number | null;
  focusDiffNonce?: number;
  onSelectStation: (code: StationCode) => void;
  onRunFlightCheck: () => void;
  onApplyStationFix: (code: StationCode) => void;
  onIssueWaiver: (waiver: WaiverInput) => void;
  onRevokeWaiver: (code: StationCode) => void;
  onProceedToGate2: () => void;
}

function stationPrimaryReadout(
  station: StationResult,
  preset: AccountPreset,
): { value: string; unit: string; fillPct: number } {
  const obs = station.evidence.payload;
  switch (station.stationCode) {
    case "AUTH_SSO": {
      const ttl = Number(obs.cert_ttl_days ?? 0);
      const label = ttl < 1 ? `${Math.round(ttl * 24)}h` : `${ttl}d`;
      return {
        value: label,
        unit: `${String(obs.protocol ?? "saml2").toUpperCase()} · CERT TTL`,
        fillPct: station.telemetryPassed ? 100 : Math.min(25, Math.max(8, (ttl / 30) * 100)),
      };
    }
    case "RESIDENCY": {
      const reg = String(obs.region ?? "unknown");
      return {
        value: reg,
        unit: station.telemetryPassed ? "ALLOWLIST VERIFIED" : "OUT-OF-REGION LEAK",
        fillPct: station.telemetryPassed ? 100 : 22,
      };
    }
    case "WEBHOOKS": {
      const keys = Array.isArray(obs.active_key_ids) ? obs.active_key_ids.length : 1;
      return {
        value: station.telemetryPassed ? "2-KEY" : `${keys}-KEY`,
        unit: station.telemetryPassed ? "HMAC-SHA256 STRICT" : "UNSIGNED / SINGLE KEY",
        fillPct: station.telemetryPassed ? 100 : 30,
      };
    }
    case "QUOTA_RATE": {
      const rps = Number(obs.provisioned_rps ?? 0);
      const sold = preset.config.sold_contract.quota.guaranteed_rps;
      const pct = Math.min(100, Math.round((rps / Math.max(1, sold)) * 100));
      return {
        value: `${Math.round(rps / 1000)}k`,
        unit: `RPS OF ${Math.round(sold / 1000)}k CONTRACT`,
        fillPct: station.telemetryPassed ? 100 : Math.max(10, pct),
      };
    }
    case "ALERTING": {
      const ack = Number(obs.ack_latency_ms ?? 0);
      return {
        value: station.telemetryPassed ? `${ack}ms` : "404",
        unit: station.telemetryPassed ? "SYNTHETIC P1 ACK" : "CHANNEL ARCHIVED",
        fillPct: station.telemetryPassed ? 100 : 12,
      };
    }
    case "ROLLBACK": {
      const rto = Number(obs.observed_rto_minutes ?? 0);
      const maxRto = preset.config.sold_contract.rollback.max_rto_minutes;
      return {
        value: `${rto}m`,
        unit: `OBSERVED RTO (MAX ${maxRto}m)`,
        fillPct: station.telemetryPassed ? 100 : station.status === "HOLD_WAIVED" ? 68 : 35,
      };
    }
    default: {
      return {
        value: station.telemetryPassed
          ? `HTTP ${station.evidence.httpStatus}`
          : station.isHardStop
            ? "LOCKED"
            : `HTTP ${station.evidence.httpStatus}`,
        unit: station.isHardStop
          ? "CUSTOM HARD STOP PROBE"
          : "CUSTOM TELEMETRY PROBE",
        fillPct: station.telemetryPassed ? 100 : station.status === "HOLD_WAIVED" ? 66 : 18,
      };
    }
  }
}

function statusColor(status: StationResult["status"]): string {
  if (status === "NOMINAL") return "var(--nominal)";
  if (status === "HOLD_WAIVED") return "var(--waived)";
  if (status === "NO_GO") return "var(--nogo)";
  return "var(--pending)";
}

function statusPillClass(status: StationResult["status"]): string {
  if (status === "NOMINAL") return "status-nominal";
  if (status === "HOLD_WAIVED") return "status-waived";
  if (status === "NO_GO") return "status-nogo";
  return "status-pending";
}

function statusDisplay(status: StationResult["status"]): string {
  if (status === "HOLD_WAIVED") return "HOLD / WAIVED";
  if (status === "NO_GO") return "NO-GO";
  return status;
}

export function Gate1FlightCheck({
  preset,
  customStations,
  flightCheck,
  selectedStation,
  sweepingIndex,
  focusDiffNonce = 0,
  onSelectStation,
  onRunFlightCheck,
  onApplyStationFix,
  onIssueWaiver,
  onRevokeWaiver,
  onProceedToGate2,
}: Gate1FlightCheckProps) {
  const diffInspectorRef = useRef<HTMLElement | null>(null);
  const [waiverModalStation, setWaiverModalStation] =
    useState<StationResult | null>(null);
  const [waiverOwner, setWaiverOwner] = useState(
    preset.config.account.customer_eng_lead,
  );
  const [waiverReason, setWaiverReason] = useState("");
  const [waiverExpiresAt, setWaiverExpiresAt] = useState("2026-12-12");
  const [waiverRollback, setWaiverRollback] = useState("");
  const [waiverTicket, setWaiverTicket] = useState("OPS-2041");
  const [waiverError, setWaiverError] = useState<string | null>(null);

  useEffect(() => {
    if (focusDiffNonce === 0) return;
    const frame = window.requestAnimationFrame(() => {
      diffInspectorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusDiffNonce]);

  const activeStation =
    flightCheck.stations.find((s) => s.stationCode === selectedStation) ??
    flightCheck.stations[0]!;
  const builtInMeta = GATE1_SUB_STAGES.find(
    (m) => m.stationCode === activeStation.stationCode,
  );
  const activeOwnerLabel =
    builtInMeta?.singleAccountableOwner ?? activeStation.accountableOwner;
  const activeEngineersLabel = builtInMeta
    ? `${builtInMeta.vendorEngineers.join(", ")} + ${builtInMeta.customerEngineers.join(", ")}`
    : `Lead FDE + ${activeStation.accountableOwner} (Custom Station Owner)`;
  const matchingPatchDiff = preset.patchDiffs.find(
    (d) => d.targetType === "station" && d.targetId === activeStation.stationCode,
  );

  const openWaiverModal = (station: StationResult) => {
    if (station.isHardStop) return;
    setWaiverModalStation(station);
    setWaiverOwner(preset.config.account.customer_eng_lead);
    setWaiverReason(
      `Bounded staging remediation scheduled for ${station.stationLabel}; verified manual safeguard active.`,
    );
    setWaiverExpiresAt("2026-12-12");
    setWaiverRollback(
      `Execute verified manual ${station.stationLabel.toLowerCase()} fallback runbook if staging drift occurs.`,
    );
    setWaiverTicket(`NX-${station.index}04`);
    setWaiverError(null);
  };

  const handleSubmitWaiver = () => {
    if (!waiverModalStation) return;
    const candidate: WaiverInput = {
      station: waiverModalStation.stationCode,
      owner: waiverOwner.trim(),
      reason: waiverReason.trim(),
      expires_at: waiverExpiresAt.trim(),
      rollback_plan: waiverRollback.trim(),
      ticket_id: waiverTicket.trim() || undefined,
      issued_at: preset.referenceDate,
    };

    // Validate live through @nominalx/core's evaluateWaivers() against existing active waivers
    const existingActive: WaiverInput[] = flightCheck.waiverAudit.activeWaivers
      .filter((w) => w.stationCode !== waiverModalStation.stationCode)
      .map((w) => ({
        station: w.stationCode ?? w.stationInput,
        owner: w.owner,
        reason: w.reason,
        expires_at: w.expiresAt,
        rollback_plan: w.rollbackPlan,
        ticket_id: w.ticketId,
        issued_at: w.issuedAt,
      }));

    const audit = evaluateWaivers(
      [...existingActive, candidate],
      preset.referenceDate,
      customStations,
    );
    const rejected = audit.rejectedWaivers.find(
      (w) => w.stationCode === waiverModalStation.stationCode,
    );
    if (rejected) {
      setWaiverError(
        rejected.violationMessage ?? "Waiver violates NominalX governance policy.",
      );
      return;
    }

    onIssueWaiver(candidate);
    setWaiverModalStation(null);
    setWaiverError(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Gate 1 Action Header */}
      <div className="panel gate-action-header">
        <div>
          <div className="eyebrow">
            STAGE 2: SALES-TO-FDE HANDOFF · GATE 1 (1 OF 3): FLIGHT CHECK · SPRINT 1
          </div>
          <h2 className="gate-title-xl">
            Sold Contract vs. Live Staging Telemetry ({flightCheck.counts.total} Parallel Stations)
          </h2>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="status-pill status-nominal">
            {flightCheck.counts.nominal} NOMINAL
          </span>
          <span className="status-pill status-waived">
            {flightCheck.counts.heldWaived}/2 WAIVED
          </span>
          <span className="status-pill status-nogo">
            {flightCheck.counts.noGo} NO-GO
          </span>

          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={onRunFlightCheck}
            disabled={sweepingIndex !== null}
            data-testid="run-flight-check-btn"
          >
            {sweepingIndex !== null ? "POLLING STATIONS..." : "RUN FLIGHT CHECK"}
          </button>

          {flightCheck.passed && (
            <button
              type="button"
              className="btn btn-nominal btn-lg"
              onClick={onProceedToGate2}
              data-testid="proceed-to-gate2-btn"
            >
              Proceed to Gate 2: Static Fire →
            </button>
          )}
        </div>
      </div>

      {/* 6 HUGE Graphic Station Tiles (3x2) */}
      <div className="station-grid">
        {flightCheck.stations.map((station, idx) => {
          const metric = stationPrimaryReadout(station, preset);
          const color = statusColor(station.status);
          const isSelected = station.stationCode === activeStation.stationCode;
          const isSweeping = sweepingIndex === idx;

          return (
            <button
              key={station.stationCode}
              type="button"
              className={`station-tile tile-${station.status} ${isSelected ? "tile-selected" : ""} ${isSweeping ? "tile-sweeping" : ""}`}
              onClick={() => onSelectStation(station.stationCode)}
              data-testid={`station-tile-${station.stationCode}`}
            >
              {/* Top Row: Icon + Title + Status Pill */}
              <div className="station-tile-head">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    className="station-icon-box"
                    style={{ borderColor: color }}
                  >
                    <StationGlyph code={station.stationCode} color={color} />
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="mono" style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--active-text)" }}>
                        {station.subStage}
                      </span>
                      {station.isCustom && (
                        <span className="mono" style={{ fontSize: "0.62rem", fontWeight: 800, padding: "1px 5px", borderRadius: 5, background: "var(--active-bg)", color: "var(--active-text)", border: "1px solid var(--active-border)" }}>
                          CUSTOM
                        </span>
                      )}
                    </div>
                    <div className="station-name-lg">{station.stationLabel}</div>
                  </div>
                </div>

                <span className={`status-pill ${statusPillClass(station.status)}`}>
                  {isSweeping ? "POLLING" : statusDisplay(station.status)}
                </span>
              </div>

              {/* Policy Shield Row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                {station.isHardStop ? (
                  <span className="hard-stop-shield">
                    <ShieldLockIcon size={13} />
                    <span>HARD STOP · NON-WAIVABLE</span>
                  </span>
                ) : (
                  <span className="op-waiver-badge">
                    OPERATIONAL · WAIVER ELIGIBLE
                  </span>
                )}
                <span className="mono" style={{ fontSize: "0.76rem", color: "var(--text-muted)", fontWeight: 700 }}>
                  {station.latencyMs}ms
                </span>
              </div>

              {/* Oversized Primary Telemetry Metric + Fill Bar */}
              <div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <span className="station-metric-big" style={{ color }}>
                    {metric.value}
                  </span>
                  <span className="mono" style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>
                    {metric.unit}
                  </span>
                </div>
                <div className="health-bar-track" style={{ marginTop: 8 }}>
                  <div
                    className="health-bar-fill"
                    style={{
                      width: `${metric.fillPct}%`,
                      background: color,
                    }}
                  />
                </div>
              </div>

              {/* Compact Sold -> Observed & Owner Footer */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, paddingTop: 4, borderTop: "1px solid var(--border-subtle)" }}>
                <span className="mono" style={{ fontSize: "0.72rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  OWNER: {station.accountableOwner}
                </span>
                <span className="mono" style={{ fontSize: "0.7rem", color: "var(--active-text)", fontWeight: 700 }}>
                  {isSelected ? "INSPECTING ●" : "INSPECT →"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Station Visual Contract Diff Inspector */}
      <section
        ref={diffInspectorRef}
        className="panel diff-inspector"
        style={{ scrollMarginTop: 88 }}
        aria-label="Contract vs Live Telemetry Diff Inspector"
        data-testid="station-diff-inspector"
      >
        {/* Left: Contract Promised vs Live Telemetry Diff */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div className="eyebrow">
                {activeStation.subStage} · {activeStation.stationLabel} TELEMETRY DIFF
              </div>
              <h3 style={{ margin: "4px 0 0", fontSize: "1.25rem", fontWeight: 800 }}>
                Contract Promised vs. Live Staging Telemetry
              </h3>
            </div>
            <span className={`status-pill lg ${statusPillClass(activeStation.status)}`}>
              {statusDisplay(activeStation.status)}
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              padding: "0 4px",
            }}
          >
            <div className="eyebrow" style={{ color: "var(--active-text)" }}>
              CONTRACT PROMISED (nominalx.yaml)
            </div>
            <div className="eyebrow" style={{ color: statusColor(activeStation.status) }}>
              LIVE TELEMETRY OBSERVED
            </div>
          </div>

          <div className="diff-table">
            {activeStation.deltas.map((delta) => (
              <div
                key={delta.field}
                className={`diff-row ${delta.matched ? "matched" : "mismatch"}`}
              >
                <div>
                  <div className="mono" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    {delta.field}
                  </div>
                  <div className="mono" style={{ fontSize: "0.9rem", fontWeight: 800, marginTop: 3 }}>
                    {delta.sold}
                  </div>
                </div>
                <div style={{ borderLeft: "1px solid var(--border-subtle)", paddingLeft: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="mono" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                      OBSERVED
                    </span>
                    <span
                      className="mono"
                      style={{
                        fontSize: "0.68rem",
                        fontWeight: 800,
                        color: delta.matched ? "var(--nominal-text)" : "var(--nogo-text)",
                      }}
                    >
                      {delta.matched ? "MATCH" : "DRIFT"}
                    </span>
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: "0.9rem",
                      fontWeight: 800,
                      marginTop: 3,
                      color: delta.matched ? "var(--nominal-text)" : "var(--nogo-text)",
                    }}
                  >
                    {delta.observed}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Active Waiver Banner if Waived */}
          {activeStation.activeWaiver && (
            <div
              style={{
                padding: "14px 16px",
                borderRadius: 13,
                background: "var(--waived-bg)",
                border: "1.5px solid var(--waived-border)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span className="eyebrow" style={{ color: "var(--waived-text)" }}>
                  ACTIVE OPERATIONAL WAIVER · {activeStation.activeWaiver.agingBand}
                </span>
                <span className="mono" style={{ fontSize: "0.76rem", fontWeight: 800, color: "var(--waived-text)" }}>
                  EXPIRES {activeStation.activeWaiver.expiresAt} ({activeStation.activeWaiver.daysRemaining}d LEFT)
                </span>
              </div>
              <div style={{ fontSize: "0.84rem", fontWeight: 700 }}>
                Owner: <span className="mono">{activeStation.activeWaiver.owner}</span> · Ticket:{" "}
                <span className="mono">{activeStation.activeWaiver.ticketId ?? "N/A"}</span>
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                Rollback Plan: {activeStation.activeWaiver.rollbackPlan}
              </div>
            </div>
          )}

          {/* Action Bar: Patch & Re-Poll + Waiver (Operational Only) or Locked Hard Stop */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingTop: 4 }}>
            {!activeStation.telemetryPassed && (
              <button
                type="button"
                className="btn btn-nominal btn-lg"
                onClick={() => onApplyStationFix(activeStation.stationCode)}
                data-testid="apply-station-fix-btn"
              >
                Apply Staging Fix &amp; Re-Poll
              </button>
            )}

            {activeStation.isHardStop ? (
              <div
                className="hard-stop-shield"
                style={{ padding: "11px 15px", fontSize: "0.78rem" }}
                data-testid="hard-stop-locked-indicator"
              >
                <ShieldLockIcon size={16} />
                <span>LOCKED · NON-WAIVABLE HARD STOP (LIVE TELEMETRY REQUIRED)</span>
              </div>
            ) : !activeStation.telemetryPassed && !activeStation.activeWaiver ? (
              <button
                type="button"
                className="btn btn-waived btn-lg"
                onClick={() => openWaiverModal(activeStation)}
                data-testid="issue-risk-waiver-btn"
              >
                Issue Risk Waiver
              </button>
            ) : activeStation.activeWaiver ? (
              <button
                type="button"
                className="btn"
                onClick={() => onRevokeWaiver(activeStation.stationCode)}
                data-testid="revoke-waiver-btn"
              >
                Revoke Waiver
              </button>
            ) : (
              <span className="status-pill lg status-nominal">
                VERIFIED NOMINAL BY LIVE TELEMETRY
              </span>
            )}
          </div>
        </div>

        {/* Right: Raw Wire Trace + Staging Patch Diff + Sub-Stage Owner */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="eyebrow">RAW WIRE EVIDENCE</span>
            <span className="mono" style={{ fontSize: "0.74rem", color: "var(--active-text)", fontWeight: 700 }}>
              {activeStation.evidence.method} {activeStation.evidence.endpoint} · HTTP {activeStation.evidence.httpStatus} · {activeStation.latencyMs}ms
            </span>
          </div>

          <div className="wire-terminal">
            <div style={{ color: "#38bdf8", marginBottom: 6 }}>
              $ curl -i {preset.config.environment.base_url}
              {activeStation.evidence.endpoint}
            </div>
            {Object.entries(activeStation.evidence.headers).map(([k, v]) => (
              <div key={k} style={{ color: "#94a3b8" }}>
                <span style={{ color: "#cbd5e1" }}>{k}:</span> {v}
              </div>
            ))}
            <div style={{ borderTop: "1px solid rgba(148,163,184,0.2)", margin: "8px 0", paddingTop: 8 }}>
              {activeStation.evidence.highlightLines.map((line) => (
                <div
                  key={line}
                  style={{
                    color: activeStation.telemetryPassed ? "#4ade80" : "#fca5a5",
                    fontWeight: 700,
                  }}
                >
                  ▸ {line}
                </div>
              ))}
            </div>
          </div>

          {matchingPatchDiff && !activeStation.telemetryPassed && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                STAGED INFRASTRUCTURE FIX PREVIEW · {matchingPatchDiff.label}
              </div>
              <div className="code-diff-box">
                {matchingPatchDiff.diffLines.map((line) => (
                  <span
                    key={line}
                    className={
                      line.startsWith("-")
                        ? "diff-line-del"
                        : line.startsWith("+")
                          ? "diff-line-add"
                          : ""
                    }
                  >
                    {line}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: "var(--bg-surface-2)",
              border: "1px solid var(--border-subtle)",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <div>
              <div className="eyebrow">SUB-STAGE OWNER</div>
              <div style={{ fontSize: "0.82rem", fontWeight: 800, marginTop: 3 }}>
                {activeOwnerLabel}
              </div>
            </div>
            <div>
              <div className="eyebrow">REQUIRED ENGINEERS</div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 3 }}>
                {activeEngineersLabel}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Operational Risk Waiver Modal (Validated by @nominalx/core) */}
      {waiverModalStation && (
        <div
          className="overlay-modal-center"
          onClick={() => setWaiverModalStation(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Issue Operational Risk Waiver"
          data-testid="risk-waiver-modal"
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div className="eyebrow" style={{ color: "var(--waived-text)" }}>
                  BOUNDED OPERATIONAL RISK WAIVER · MAX 2 ACTIVE · ≤ 30 DAYS
                </div>
                <h3 style={{ margin: "4px 0 0", fontSize: "1.3rem", fontWeight: 800 }}>
                  {waiverModalStation.subStage} {waiverModalStation.stationLabel}
                </h3>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => setWaiverModalStation(null)}
              >
                Cancel
              </button>
            </div>

            {waiverError && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "var(--nogo-bg)",
                  border: "1.5px solid var(--nogo-border)",
                  color: "var(--nogo-text)",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                }}
                role="alert"
              >
                {waiverError}
              </div>
            )}

            <div className="field-group">
              <label className="field-label" htmlFor="waiver-owner">
                Named Engineering Owner
              </label>
              <input
                id="waiver-owner"
                className="field-input mono"
                value={waiverOwner}
                onChange={(e) => setWaiverOwner(e.target.value)}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="field-group">
                <label className="field-label" htmlFor="waiver-expires">
                  Expiry Date (≤ 30d from {preset.referenceDate})
                </label>
                <input
                  id="waiver-expires"
                  type="date"
                  className="field-input mono"
                  value={waiverExpiresAt}
                  onChange={(e) => setWaiverExpiresAt(e.target.value)}
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="waiver-ticket">
                  Jira / Linear Ticket ID
                </label>
                <input
                  id="waiver-ticket"
                  className="field-input mono"
                  value={waiverTicket}
                  onChange={(e) => setWaiverTicket(e.target.value)}
                />
              </div>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="waiver-reason">
                Operational Justification
              </label>
              <textarea
                id="waiver-reason"
                className="field-input"
                rows={2}
                value={waiverReason}
                onChange={(e) => setWaiverReason(e.target.value)}
              />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="waiver-rollback">
                Concrete Rollback Plan
              </label>
              <textarea
                id="waiver-rollback"
                className="field-input"
                rows={2}
                value={waiverRollback}
                onChange={(e) => setWaiverRollback(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setWaiverModalStation(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-waived btn-lg"
                onClick={handleSubmitWaiver}
                data-testid="submit-waiver-btn"
              >
                Validate &amp; Issue Waiver
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
