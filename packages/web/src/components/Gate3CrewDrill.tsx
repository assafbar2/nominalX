import { useEffect, useState } from "react";
import {
  CREW_DRILL_ALARM_ORDER,
  type CrewAlarmId,
  type CrewAlarmState,
  type CrewDrillMachineState,
  type CrewDrillResult,
} from "@nominalx/core";

interface Gate3CrewDrillProps {
  crewDrill: CrewDrillMachineState;
  crewSummary: CrewDrillResult;
  onStartAlarm: (alarmId: CrewAlarmId) => void;
  onTickAlarm: (alarmId: CrewAlarmId, elapsedSeconds: number) => void;
  onApplyRemediation: (
    alarmId: CrewAlarmId,
    patch: Record<string, string | number | boolean>,
    elapsedSeconds: number,
  ) => { accepted: boolean; message: string };
  onProceedToDossier: () => void;
}

function formatClock(seconds: number): string {
  const abs = Math.max(0, seconds);
  const mins = Math.floor(abs / 60);
  const secs = Math.floor(abs % 60);
  const tenths = Math.floor((abs % 1) * 10);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
}

function AlarmTelemetryChart({ alarm }: { alarm: CrewAlarmState }) {
  const width = 560;
  const height = 176;
  const padL = 52;
  const padR = 16;
  const padT = 18;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const samples = alarm.telemetrySeries;
  const values = samples.map((s) => s.value);
  const sla = alarm.scenario.slaThreshold;
  const isHigherBetter = alarm.alarmId === "sso_cert_expiring_24h";
  const maxVal = Math.max(sla * 1.4, ...values, 10);

  const xFor = (i: number) =>
    samples.length <= 1
      ? padL + plotW * 0.5
      : padL + (i / (samples.length - 1)) * plotW;
  const yFor = (val: number) =>
    padT + plotH - (Math.min(maxVal, Math.max(0, val)) / maxVal) * plotH;

  const slaY = yFor(sla);
  const points = samples
    .map((s, i) => `${xFor(i).toFixed(1)},${yFor(s.value).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      aria-label={`${alarm.alarmName} Live Metric Chart`}
    >
      {/* Green SLA band */}
      {isHigherBetter ? (
        <rect
          x={padL}
          y={padT}
          width={plotW}
          height={Math.max(4, slaY - padT)}
          fill="var(--nominal-bg)"
        />
      ) : (
        <rect
          x={padL}
          y={slaY}
          width={plotW}
          height={Math.max(4, padT + plotH - slaY)}
          fill="var(--nominal-bg)"
        />
      )}

      {/* SLA threshold line */}
      <line
        x1={padL}
        y1={slaY}
        x2={width - padR}
        y2={slaY}
        stroke="var(--nominal)"
        strokeWidth="2"
        strokeDasharray="6 4"
      />
      <text
        x={width - padR - 4}
        y={slaY - 5}
        textAnchor="end"
        fill="var(--nominal-text)"
        className="mono"
        style={{ fontSize: 10, fontWeight: 800 }}
      >
        GREEN SLA: {sla} {alarm.scenario.metricUnit}
      </text>

      {/* Metric curve */}
      {samples.length > 1 && (
        <polyline
          fill="none"
          stroke={alarm.status === "stabilized" ? "var(--nominal)" : "var(--nogo)"}
          strokeWidth="3"
          strokeLinejoin="round"
          points={points}
        />
      )}

      {/* Points */}
      {samples.map((s, i) => (
        <circle
          key={s.tick}
          cx={xFor(i)}
          cy={yFor(s.value)}
          r={s.withinSla ? 4.5 : 3.5}
          fill={s.withinSla ? "var(--nominal)" : "var(--nogo)"}
        />
      ))}

      {/* Y-axis labels */}
      <text x={padL - 8} y={padT + 10} textAnchor="end" fill="var(--text-dim)" className="mono" style={{ fontSize: 10 }}>
        {Math.round(maxVal)}
      </text>
      <text x={padL - 8} y={padT + plotH} textAnchor="end" fill="var(--text-dim)" className="mono" style={{ fontSize: 10 }}>
        0
      </text>
    </svg>
  );
}

export function Gate3CrewDrill({
  crewDrill,
  crewSummary,
  onStartAlarm,
  onTickAlarm,
  onApplyRemediation,
  onProceedToDossier,
}: Gate3CrewDrillProps) {
  const [selectedAlarmId, setSelectedAlarmId] = useState<CrewAlarmId>(
    crewDrill.activeAlarmId ?? "runaway_ingestion_storm",
  );

  // Sync active alarm selection when advancing after stabilization
  useEffect(() => {
    if (crewDrill.activeAlarmId) {
      setSelectedAlarmId(crewDrill.activeAlarmId);
    }
  }, [crewDrill.activeAlarmId]);

  const activeAlarm = crewDrill.alarms[selectedAlarmId];

  // Local tactile config form state per alarm (real ops controls, zero multiple-choice)
  const req1 = crewDrill.alarms.runaway_ingestion_storm.scenario.expectedRemediation.requiredPatch;
  const req2 = crewDrill.alarms.sso_cert_expiring_24h.scenario.expectedRemediation.requiredPatch;
  const req3 = crewDrill.alarms.dead_p1_alert_channel.scenario.expectedRemediation.requiredPatch;

  const [sourceKey, setSourceKey] = useState<string>("none");
  const [rateCapRps, setRateCapRps] = useState<number>(
    Number(req1.rate_cap_rps) * 3,
  );
  const [dlqEnabled, setDlqEnabled] = useState<boolean>(false);

  const [certFingerprint, setCertFingerprint] = useState<string>(
    "SHA256:OLD:EXPIRING:CERT",
  );
  const [dualGraceMode, setDualGraceMode] = useState<boolean>(false);

  const [p1Channel, setP1Channel] = useState<string>(
    String(crewDrill.alarms.dead_p1_alert_channel.scenario.defaultContext.active_p1_channel),
  );
  const [pingVerified, setPingVerified] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  // Reset form defaults cleanly when account changes
  useEffect(() => {
    setSourceKey("none");
    setRateCapRps(Number(req1.rate_cap_rps) * 3);
    setDlqEnabled(false);
    setCertFingerprint("SHA256:OLD:EXPIRING:CERT");
    setDualGraceMode(false);
    setP1Channel(
      String(crewDrill.alarms.dead_p1_alert_channel.scenario.defaultContext.active_p1_channel),
    );
    setPingVerified(false);
    setFeedback(null);
  }, [crewDrill.accountId, req1.rate_cap_rps, crewDrill.alarms.dead_p1_alert_channel.scenario.defaultContext.active_p1_channel]);

  // Live 1-second timer tick for active/overtime alarm
  useEffect(() => {
    if (activeAlarm.status !== "active" && activeAlarm.status !== "overtime") {
      return;
    }
    const timer = window.setInterval(() => {
      onTickAlarm(activeAlarm.alarmId, Math.round((activeAlarm.elapsedSeconds + 1) * 10) / 10);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeAlarm.alarmId, activeAlarm.status, activeAlarm.elapsedSeconds, onTickAlarm]);

  const handleApplyFix = () => {
    if (activeAlarm.status === "idle") {
      onStartAlarm(activeAlarm.alarmId);
    }
    const elapsed = Math.max(1.2, activeAlarm.elapsedSeconds || 4.2);
    let patch: Record<string, string | number | boolean> = {};
    if (selectedAlarmId === "runaway_ingestion_storm") {
      patch = {
        isolated_source_key: sourceKey.trim(),
        rate_cap_rps: Number(rateCapRps),
        dlq_overflow_enabled: dlqEnabled,
      };
    } else if (selectedAlarmId === "sso_cert_expiring_24h") {
      patch = {
        promote_cert_fingerprint: certFingerprint.trim(),
        dual_cert_grace_mode: dualGraceMode,
      };
    } else {
      patch = {
        active_p1_channel: p1Channel.trim(),
        synthetic_ping_verified: pingVerified,
      };
    }
    const res = onApplyRemediation(selectedAlarmId, patch, elapsed);
    setFeedback({ ok: res.accepted, text: res.message });
  };

  const clockUrgency =
    activeAlarm.status === "stabilized"
      ? "green"
      : activeAlarm.overtime || activeAlarm.remainingSeconds <= 15
        ? "red"
        : activeAlarm.remainingSeconds <= 30
          ? "amber"
          : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Gate 3 Action Header */}
      <div className="panel gate-action-header">
        <div>
          <div className="eyebrow">
            STAGE 4: DAY-30 ENABLEMENT &amp; HANDOVER · GATE 3 (3 OF 3): CREW DRILL · SPRINT 3
          </div>
          <h2 className="gate-title-xl">
            Live 90-Second Ops Game-Day Console (Zero Multiple-Choice Quizzes)
          </h2>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span
            className={`status-pill lg ${crewSummary.allStabilized ? "status-nominal" : "status-active"}`}
          >
            {crewSummary.stabilizedCount} / 3 ALARMS STABILIZED
          </span>

          {activeAlarm.status === "idle" && (
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => {
                setFeedback(null);
                onStartAlarm(selectedAlarmId);
              }}
              data-testid="start-crew-drill-btn"
            >
              START CREW DRILL ({activeAlarm.subStage})
            </button>
          )}

          {crewSummary.allStabilized && (
            <button
              type="button"
              className="btn btn-nominal btn-lg"
              onClick={onProceedToDossier}
              data-testid="proceed-to-dossier-btn"
            >
              Sign NOMINAL Dossier &amp; Runbook →
            </button>
          )}
        </div>
      </div>

      {/* 3-Column Game-Day Cockpit */}
      <div className="drill-layout">
        {/* Left: 3 Big Drill Cards (1 of 3 -> 3 of 3) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {CREW_DRILL_ALARM_ORDER.map((id) => {
            const alarm = crewDrill.alarms[id];
            const isSelected = id === selectedAlarmId;
            const pillClass =
              alarm.status === "stabilized"
                ? alarm.overtime
                  ? "status-waived"
                  : "status-nominal"
                : alarm.status === "overtime"
                  ? "status-nogo"
                  : alarm.status === "active"
                    ? "status-active"
                    : "status-pending";

            return (
              <button
                key={id}
                type="button"
                className={`drill-card ${isSelected ? "selected" : ""} ${alarm.status}`}
                onClick={() => {
                  setSelectedAlarmId(id);
                  setFeedback(null);
                }}
                data-testid={`drill-card-${id}`}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                  <span className="mono" style={{ fontSize: "0.74rem", fontWeight: 800, color: "var(--active-text)" }}>
                    {alarm.subStage} · P1 ALARM
                  </span>
                  <span className={`status-pill ${pillClass}`}>
                    {alarm.status === "stabilized"
                      ? alarm.overtime
                        ? "OVERTIME PASS"
                        : "STABILIZED"
                      : alarm.status.toUpperCase()}
                  </span>
                </div>

                <div style={{ fontSize: "1.05rem", fontWeight: 800, lineHeight: 1.2 }}>
                  {alarm.alarmName}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                  <span className="mono" style={{ fontSize: "1.35rem", fontWeight: 800 }}>
                    {alarm.splitMs !== null ? `${(alarm.splitMs / 1000).toFixed(1)}s` : "90.0s"}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {[1, 2, 3].map((tick) => (
                      <span
                        key={tick}
                        className={`led-pip ${alarm.consecutiveSlaTicks >= tick ? "NOMINAL" : "PENDING"}`}
                        style={{ width: 16, flex: "none" }}
                        title={`Green SLA Tick ${tick}/3`}
                      />
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Center: 90s Countdown Clock + Live SVG Metric Chart + Error Log Stream */}
        <div className="panel panel-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className={`countdown-box ${clockUrgency}`} data-testid="drill-countdown-box">
            <div>
              <div className="eyebrow">
                {activeAlarm.subStage} · {activeAlarm.shortName.toUpperCase()}
              </div>
              <div style={{ fontSize: "0.86rem", fontWeight: 700, marginTop: 3 }}>
                {activeAlarm.status === "stabilized"
                  ? "3/3 CONSECUTIVE GREEN SLA TICKS LOCKED"
                  : activeAlarm.overtime
                    ? "OVERTIME ACTIVE — COMPLETE REAL REMEDIATION"
                    : activeAlarm.status === "active"
                      ? "LIVE P1 INCIDENT CLOCK RUNNING"
                      : "READY TO INJECT LIVE DAY-30 ALARM"}
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div
                className="countdown-digits"
                style={{
                  color:
                    clockUrgency === "green"
                      ? "var(--nominal-text)"
                      : clockUrgency === "red"
                        ? "var(--nogo-text)"
                        : clockUrgency === "amber"
                          ? "var(--waived-text)"
                          : "var(--text-primary)",
                }}
              >
                {activeAlarm.status === "stabilized" && activeAlarm.splitMs !== null
                  ? `${(activeAlarm.splitMs / 1000).toFixed(1)}s`
                  : activeAlarm.overtime
                    ? `+${formatClock(activeAlarm.elapsedSeconds - activeAlarm.timeLimitSeconds)}`
                    : formatClock(activeAlarm.remainingSeconds)}
              </div>
              <div className="mono" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                {activeAlarm.overtime ? "OVERTIME" : "90s SLA BUDGET"}
              </div>
            </div>
          </div>

          <div
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              background: "var(--bg-surface-2)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span className="eyebrow">LIVE TELEMETRY · {activeAlarm.scenario.metricLabel.toUpperCase()}</span>
              <span className="mono" style={{ fontSize: "0.8rem", fontWeight: 800, color: activeAlarm.status === "stabilized" ? "var(--nominal-text)" : "var(--nogo-text)" }}>
                CURRENT: {activeAlarm.telemetrySeries[activeAlarm.telemetrySeries.length - 1]?.value}{" "}
                {activeAlarm.scenario.metricUnit}
              </span>
            </div>
            <AlarmTelemetryChart alarm={activeAlarm} />
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              LIVE INCIDENT ERROR STREAM
            </div>
            <div className="wire-terminal" style={{ maxHeight: 150, overflowY: "auto" }}>
              {activeAlarm.errorTrace.map((line, idx) => (
                <div
                  key={`${idx}-${line}`}
                  style={{
                    color: line.startsWith("VERIFY FAILED") ? "#fca5a5" : "#fbbf24",
                  }}
                >
                  [{String(idx + 1).padStart(2, "0")}] {line}
                </div>
              ))}
              {activeAlarm.verificationProof && (
                <div style={{ color: "#4ade80", fontWeight: 700, marginTop: 6 }}>
                  ✓ {activeAlarm.verificationProof}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Real Tactile Config Remediation Console */}
        <div className="panel panel-pad" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <span className="eyebrow">OPS REMEDIATION CONSOLE · REAL CONFIG PATCH</span>
              <h3 style={{ margin: "4px 0 0", fontSize: "1.15rem", fontWeight: 800 }}>
                {activeAlarm.alarmName}
              </h3>
            </div>

            {selectedAlarmId === "runaway_ingestion_storm" && (
              <>
                <div className="field-group">
                  <label className="field-label" htmlFor="drill-source-key">
                    Isolate Offending Source Key (see error trace)
                  </label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      id="drill-source-key"
                      className="field-input mono"
                      value={sourceKey}
                      onChange={(e) => setSourceKey(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setSourceKey(String(req1.isolated_source_key))}
                      data-testid="drill1-fill-source-btn"
                    >
                      Use Trace Key
                    </button>
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="drill-rate-cap">
                    Per-Tenant Rate Cap RPS (SLA ≤ {String(req1.rate_cap_rps)} RPS)
                  </label>
                  <input
                    id="drill-rate-cap"
                    type="number"
                    className="field-input mono"
                    value={rateCapRps}
                    onChange={(e) => setRateCapRps(Number(e.target.value))}
                  />
                  <input
                    type="range"
                    min={1000}
                    max={Number(req1.rate_cap_rps) * 3}
                    step={500}
                    value={rateCapRps}
                    onChange={(e) => setRateCapRps(Number(e.target.value))}
                  />
                </div>

                <label className={`switch-row ${dlqEnabled ? "checked" : ""}`}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "0.88rem" }}>Enable DLQ Overflow Queue</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Route excess burst payloads cleanly instead of retry storm
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={dlqEnabled}
                    onChange={(e) => setDlqEnabled(e.target.checked)}
                    data-testid="drill1-dlq-checkbox"
                  />
                </label>
              </>
            )}

            {selectedAlarmId === "sso_cert_expiring_24h" && (
              <>
                <div className="field-group">
                  <label className="field-label" htmlFor="drill-cert-fp">
                    Promote Staged X.509 Certificate Fingerprint
                  </label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      id="drill-cert-fp"
                      className="field-input mono"
                      value={certFingerprint}
                      onChange={(e) => setCertFingerprint(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setCertFingerprint(String(req2.promote_cert_fingerprint))}
                      data-testid="drill2-select-staged-cert-btn"
                    >
                      Select Staged
                    </button>
                  </div>
                </div>

                <label className={`switch-row ${dualGraceMode ? "checked" : ""}`}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "0.88rem" }}>Dual-Cert Grace Mode</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Accept old + promoted X.509 certs concurrently during live SSO cutover
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={dualGraceMode}
                    onChange={(e) => setDualGraceMode(e.target.checked)}
                    data-testid="drill2-grace-checkbox"
                  />
                </label>
              </>
            )}

            {selectedAlarmId === "dead_p1_alert_channel" && (
              <>
                <div className="field-group">
                  <label className="field-label" htmlFor="drill-p1-channel">
                    Rebind Active P1 Ops Channel
                  </label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      id="drill-p1-channel"
                      className="field-input mono"
                      value={p1Channel}
                      onChange={(e) => setP1Channel(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setP1Channel(String(req3.active_p1_channel))}
                      data-testid="drill3-select-active-channel-btn"
                    >
                      Use Active P1
                    </button>
                  </div>
                </div>

                <label className={`switch-row ${pingVerified ? "checked" : ""}`}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "0.88rem" }}>Execute Live Synthetic P1 Ping</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Send X-NominalX-Probe: true and require HTTP 200 OK acknowledgement
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={pingVerified}
                    onChange={(e) => setPingVerified(e.target.checked)}
                    data-testid="drill3-ping-checkbox"
                  />
                </label>
              </>
            )}

            {feedback && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: feedback.ok ? "var(--nominal-bg)" : "var(--nogo-bg)",
                  border: `1.5px solid ${feedback.ok ? "var(--nominal-border)" : "var(--nogo-border)"}`,
                  color: feedback.ok ? "var(--nominal-text)" : "var(--nogo-text)",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                }}
              >
                {feedback.text}
              </div>
            )}

            {activeAlarm.patchDiff.length > 0 && (
              <div className="code-diff-box">
                {activeAlarm.patchDiff.map((line, i) => (
                  <span
                    key={`${i}-${line}`}
                    className={line.startsWith("-") ? "diff-line-del" : "diff-line-add"}
                  >
                    {line}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {activeAlarm.status === "idle" && (
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => {
                  setFeedback(null);
                  onStartAlarm(selectedAlarmId);
                }}
              >
                Start 90s Alarm Clock
              </button>
            )}

            <button
              type="button"
              className="btn btn-nominal btn-lg"
              onClick={handleApplyFix}
              disabled={activeAlarm.status === "stabilized"}
              data-testid="apply-crew-remediation-btn"
            >
              {activeAlarm.status === "stabilized"
                ? "ALARM STABILIZED ✓"
                : "APPLY FIX & VERIFY PING"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
