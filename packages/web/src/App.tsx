import { useCallback, useEffect, useState } from "react";
import {
  ACCOUNT_PRESETS,
  applyCrewRemediation,
  getStageMetadata,
  startCrewAlarm,
  summarizeCrewDrill,
  tickCrewAlarm,
  type AccountPresetId,
  type ChaosVectorId,
  type ConfigValidationError,
  type CrewAlarmId,
  type DossierSigners,
  type StageNumber,
  type StationCode,
  type WaiverInput,
} from "@nominalx/core";
import { CustomizeDrawer } from "./components/CustomizeDrawer";
import { Gate1FlightCheck } from "./components/Gate1FlightCheck";
import { Gate2StaticFire } from "./components/Gate2StaticFire";
import { Gate3CrewDrill } from "./components/Gate3CrewDrill";
import { HeroReadinessBand } from "./components/HeroReadinessBand";
import { JourneyPipeline } from "./components/JourneyPipeline";
import { LiveWireLogDrawer } from "./components/LiveWireLogDrawer";
import { ReportsDossierHub } from "./components/ReportsDossierHub";
import {
  ScopeGovernanceDrawer,
  SprintContractStrip,
} from "./components/SprintContractStrip";
import { TopMissionBar } from "./components/TopMissionBar";
import {
  applyCustomizationsToMission,
  applyYamlToMission,
  clearStoredCustomizations,
  computeMissionJourney,
  countActiveCustomizations,
  createInitialMissionState,
  createWireEntry,
  evaluateMissionStaticFire,
  evaluatePresetFlightCheck,
  getEffectiveConfigForMission,
  saveStoredCustomizations,
  viewToStageNumber,
  type AccountCustomizations,
  type AccountMissionState,
  type CockpitView,
} from "./state/missionState";

const THEME_STORAGE_KEY = "nominalx-theme";

function loadInitialTheme(): "dark" | "light" {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Ignore storage unavailability
  }
  return "dark";
}

export function App() {
  const [theme, setTheme] = useState<"dark" | "light">(loadInitialTheme);
  const [activePresetId, setActivePresetId] =
    useState<AccountPresetId>("meridian-fintech");
  const [missions, setMissions] = useState<
    Record<AccountPresetId, AccountMissionState>
  >(() => ({
    "meridian-fintech": createInitialMissionState("meridian-fintech"),
    "kestrel-health": createInitialMissionState("kestrel-health"),
    "vanguard-retail": createInitialMissionState("vanguard-retail"),
    "helios-logistics": createInitialMissionState("helios-logistics"),
  }));
  const [activeView, setActiveView] = useState<CockpitView>("gate1");
  const [wireLogOpen, setWireLogOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [governanceDrawerStage, setGovernanceDrawerStage] =
    useState<StageNumber | null>(null);
  const [sweepingIndex, setSweepingIndex] = useState<number | null>(null);
  const [isFiring, setIsFiring] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage unavailability
    }
  }, [theme]);

  const preset = ACCOUNT_PRESETS[activePresetId];
  const mission = missions[activePresetId];
  const journey = computeMissionJourney(mission);
  const currentStageNum = viewToStageNumber(activeView);
  const customCount = countActiveCustomizations(mission.customizations);

  const updateCurrentMission = useCallback(
    (updater: (prev: AccountMissionState) => AccountMissionState) => {
      setMissions((prev) => ({
        ...prev,
        [activePresetId]: updater(prev[activePresetId]),
      }));
    },
    [activePresetId],
  );

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const handleSelectView = (view: CockpitView) => {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const handleSelectPreset = (id: AccountPresetId) => {
    setActivePresetId(id);
    setSweepingIndex(null);
    setIsFiring(false);
  };

  const handleResetScenario = () => {
    setSweepingIndex(null);
    setIsFiring(false);
    setMissions((prev) => ({
      ...prev,
      [activePresetId]: createInitialMissionState(activePresetId, {
        initialCustomizations: prev[activePresetId].customizations,
      }),
    }));
  };

  const handleUpdateCustomizations = (next: AccountCustomizations) => {
    saveStoredCustomizations(activePresetId, next);
    updateCurrentMission((prev) =>
      applyCustomizationsToMission(preset, prev, next),
    );
  };

  const handleApplyYaml = (
    yamlText: string,
  ): { ok: boolean; errors?: ConfigValidationError[] } => {
    const res = applyYamlToMission(preset, mission, yamlText);
    if (!res.ok) {
      return { ok: false, errors: res.errors };
    }
    saveStoredCustomizations(activePresetId, res.state.customizations);
    setMissions((prev) => ({
      ...prev,
      [activePresetId]: res.state,
    }));
    return { ok: true };
  };

  const handleResetCustomizations = () => {
    clearStoredCustomizations(activePresetId);
    setSweepingIndex(null);
    setIsFiring(false);
    setMissions((prev) => ({
      ...prev,
      [activePresetId]: createInitialMissionState(activePresetId, {
        skipStorage: true,
      }),
    }));
  };

  // Gate 1: Staggered animated Flight Check poll sweep
  const handleRunFlightCheck = () => {
    if (sweepingIndex !== null) return;
    const totalStations = mission.flightCheck.stations.length;
    setSweepingIndex(0);
    let idx = 0;
    const interval = window.setInterval(() => {
      idx += 1;
      if (idx >= totalStations) {
        window.clearInterval(interval);
        setSweepingIndex(null);
        updateCurrentMission((prev) => {
          const fresh = evaluatePresetFlightCheck(
            preset,
            prev.patchedStations,
            prev.customWaivers,
            prev.removedPresetWaiverStations,
            prev.customizations,
          );
          const sweepEntries = fresh.stations.map((s) =>
            createWireEntry(
              "GATE 1",
              s.evidence.method === "GET" || s.evidence.method === "POST"
                ? s.evidence.method
                : "POST",
              s.evidence.endpoint,
              s.evidence.httpStatus,
              s.latencyMs,
              `POLL #${prev.flightCheckRunCount + 1} · ${s.subStage} ${s.stationLabel} -> ${s.status}`,
              s.evidence.highlightLines,
            ),
          );
          return {
            ...prev,
            flightCheck: fresh,
            flightCheckRunCount: prev.flightCheckRunCount + 1,
            wireLog: [...sweepEntries.reverse(), ...prev.wireLog].slice(0, 60),
          };
        });
      } else {
        setSweepingIndex(idx);
      }
    }, 110);
  };

  const handleApplyStationFix = (code: StationCode) => {
    updateCurrentMission((prev) => {
      const nextPatched = prev.patchedStations.includes(code)
        ? prev.patchedStations
        : [...prev.patchedStations, code];
      const nextFlightCheck = evaluatePresetFlightCheck(
        preset,
        nextPatched,
        prev.customWaivers,
        prev.removedPresetWaiverStations,
        prev.customizations,
      );
      const station = nextFlightCheck.stations.find(
        (s) => s.stationCode === code,
      )!;
      const entry = createWireEntry(
        "GATE 1",
        "PATCH",
        station.evidence.endpoint,
        station.evidence.httpStatus,
        station.latencyMs,
        `PATCH & RE-POLL · ${station.subStage} ${station.stationLabel} -> ${station.status}`,
        station.evidence.highlightLines,
      );
      return {
        ...prev,
        patchedStations: nextPatched,
        flightCheck: nextFlightCheck,
        wireLog: [entry, ...prev.wireLog].slice(0, 60),
      };
    });
  };

  const handleIssueWaiver = (waiver: WaiverInput) => {
    updateCurrentMission((prev) => {
      const code = waiver.station as StationCode;
      const nextCustom = [
        ...prev.customWaivers.filter((w) => w.station !== waiver.station),
        waiver,
      ];
      const nextRemoved = prev.removedPresetWaiverStations.filter(
        (s) => s !== code,
      );
      const nextFlightCheck = evaluatePresetFlightCheck(
        preset,
        prev.patchedStations,
        nextCustom,
        nextRemoved,
        prev.customizations,
      );
      const entry = createWireEntry(
        "GOVERNANCE",
        "SIGN",
        `/waivers/${code.toLowerCase()}`,
        200,
        12,
        `WAIVER ISSUED · ${code} (owner ${waiver.owner}, expires ${waiver.expires_at})`,
        [waiver.reason, `Rollback: ${waiver.rollback_plan}`],
      );
      return {
        ...prev,
        customWaivers: nextCustom,
        removedPresetWaiverStations: nextRemoved,
        flightCheck: nextFlightCheck,
        wireLog: [entry, ...prev.wireLog].slice(0, 60),
      };
    });
  };

  const handleRevokeWaiver = (code: StationCode) => {
    updateCurrentMission((prev) => {
      const nextCustom = prev.customWaivers.filter(
        (w) => w.station.toUpperCase() !== code.toUpperCase(),
      );
      const nextRemoved = prev.removedPresetWaiverStations.includes(code)
        ? prev.removedPresetWaiverStations
        : [...prev.removedPresetWaiverStations, code];
      const nextFlightCheck = evaluatePresetFlightCheck(
        preset,
        prev.patchedStations,
        nextCustom,
        nextRemoved,
        prev.customizations,
      );
      const entry = createWireEntry(
        "GOVERNANCE",
        "PATCH",
        `/waivers/${code.toLowerCase()}/revoke`,
        200,
        9,
        `WAIVER REVOKED · ${code} returned to live telemetry gate`,
        [`Station ${code} now requires live NOMINAL telemetry or renewed waiver.`],
      );
      return {
        ...prev,
        customWaivers: nextCustom,
        removedPresetWaiverStations: nextRemoved,
        flightCheck: nextFlightCheck,
        wireLog: [entry, ...prev.wireLog].slice(0, 60),
      };
    });
  };

  // Gate 2: Static Fire patch toggles & re-fire
  const handleToggleStagePatch = (vectorId: ChaosVectorId) => {
    updateCurrentMission((prev) => {
      const exists = prev.stagedVectorPatches.includes(vectorId);
      const next = exists
        ? prev.stagedVectorPatches.filter((id) => id !== vectorId)
        : [...prev.stagedVectorPatches, vectorId];
      return { ...prev, stagedVectorPatches: next };
    });
  };

  const handleStageAllPatches = () => {
    updateCurrentMission((prev) => {
      const activeIds = new Set(prev.staticFire.vectors.map((v) => v.vectorId));
      const builtInIds = preset.patchDiffs
        .filter((d) => d.targetType === "vector" && activeIds.has(d.targetId))
        .map((d) => d.targetId as ChaosVectorId);
      const customIds = prev.customizations.customVectors.map(
        (cv) => cv.id as ChaosVectorId,
      );
      return {
        ...prev,
        stagedVectorPatches: [...new Set([...builtInIds, ...customIds])],
      };
    });
  };

  const handleIgniteStaticFire = () => {
    if (isFiring) return;
    setIsFiring(true);
    window.setTimeout(() => {
      updateCurrentMission((prev) => {
        const effectiveConfig = getEffectiveConfigForMission(preset, prev);
        const nextAttempt = prev.staticFire.attemptNumber + 1;
        const freshFire = evaluateMissionStaticFire(preset, effectiveConfig, {
          patchedVectors: prev.stagedVectorPatches,
          attemptNumber: nextAttempt,
          previousAttempts: prev.staticFire.attemptHistory,
        });
        const entry = createWireEntry(
          "GATE 2",
          "POST",
          effectiveConfig.environment.endpoints.webhook_ingress,
          freshFire.passed ? 200 : 500,
          Math.round(
            freshFire.vectors.reduce((a, v) => a + v.p95LatencyMs, 0) /
              Math.max(1, freshFire.vectors.length),
          ),
          `STATIC FIRE #${freshFire.attemptNumber} · ${freshFire.corruptionPct.toFixed(1)}% CORRUPTION · GRADE ${freshFire.grade} (${freshFire.totals.passedVectors}/${freshFire.totals.totalVectors} PASS)`,
          [
            `Patches active: ${prev.stagedVectorPatches.join(", ") || "none"}`,
            `Packets: ${freshFire.totals.packetsCorrupted}/${freshFire.totals.packetsSent} corrupted`,
          ],
        );
        return {
          ...prev,
          appliedVectorPatches: [...prev.stagedVectorPatches],
          staticFire: freshFire,
          wireLog: [entry, ...prev.wireLog].slice(0, 60),
        };
      });
      setIsFiring(false);
    }, 260);
  };

  // Gate 3: Crew Drill state machine handlers
  const handleStartAlarm = (alarmId: CrewAlarmId) => {
    updateCurrentMission((prev) => {
      const nextDrill = startCrewAlarm(prev.crewDrill, alarmId);
      const alarm = nextDrill.alarms[alarmId];
      if (!alarm) return prev;
      const entry = createWireEntry(
        "GATE 3",
        "POST",
        `/drill/${alarmId}/inject`,
        200,
        14,
        `CREW DRILL INJECTED · ${alarm.subStage} ${alarm.alarmName}`,
        alarm.errorTrace,
      );
      return {
        ...prev,
        crewDrill: nextDrill,
        crewSummary: summarizeCrewDrill(nextDrill),
        wireLog: [entry, ...prev.wireLog].slice(0, 60),
      };
    });
  };

  const handleTickAlarm = useCallback(
    (alarmId: CrewAlarmId, elapsedSeconds: number) => {
      updateCurrentMission((prev) => {
        const nextDrill = tickCrewAlarm(prev.crewDrill, alarmId, elapsedSeconds);
        return {
          ...prev,
          crewDrill: nextDrill,
          crewSummary: summarizeCrewDrill(nextDrill),
        };
      });
    },
    [updateCurrentMission],
  );

  const handleApplyCrewRemediation = (
    alarmId: CrewAlarmId,
    patch: Record<string, string | number | boolean>,
    elapsedSeconds: number,
  ): { accepted: boolean; message: string } => {
    const attempt = applyCrewRemediation(
      mission.crewDrill,
      alarmId,
      patch,
      elapsedSeconds,
    );
    const alarm = attempt.state.alarms[alarmId];
    const entry = createWireEntry(
      "GATE 3",
      "PATCH",
      `/drill/${alarmId}/remediate`,
      attempt.accepted ? 200 : 422,
      19,
      attempt.accepted
        ? `STABILIZED · ${alarm?.subStage ?? alarmId} (${elapsedSeconds.toFixed(1)}s)`
        : `REMEDIATION REJECTED · ${alarm?.subStage ?? alarmId}`,
      [attempt.message],
    );
    updateCurrentMission((prev) => ({
      ...prev,
      crewDrill: attempt.state,
      crewSummary: summarizeCrewDrill(attempt.state),
      wireLog: [entry, ...prev.wireLog].slice(0, 60),
    }));
    return { accepted: attempt.accepted, message: attempt.message };
  };

  const handleUpdateSigners = (signers: DossierSigners) => {
    updateCurrentMission((prev) => ({ ...prev, signers }));
  };

  const handleToggleSignDossier = () => {
    updateCurrentMission((prev) => {
      const nextSigned = !prev.dossierSigned;
      const effectiveConfig = getEffectiveConfigForMission(preset, prev);
      const entry = createWireEntry(
        "GOVERNANCE",
        "SIGN",
        `/dossier/${effectiveConfig.account.id}/seal`,
        200,
        8,
        nextSigned
          ? `NOMINAL DOSSIER SIGNED · Lead FDE ${prev.signers.leadFde} + Customer Lead ${prev.signers.customerEngLead}`
          : `DOSSIER SEAL REOPENED FOR EDITS`,
        [`Target Go-Live: ${effectiveConfig.account.target_go_live}`],
      );
      return {
        ...prev,
        dossierSigned: nextSigned,
        wireLog: [entry, ...prev.wireLog].slice(0, 60),
      };
    });
  };

  return (
    <div className="app-shell">
      <TopMissionBar
        activePresetId={activePresetId}
        onSelectPreset={handleSelectPreset}
        onReset={handleResetScenario}
        onOpenCustomize={() => setCustomizeOpen(true)}
        customCount={customCount}
        onOpenWireLog={() => setWireLogOpen(true)}
        wireLogCount={mission.wireLog.length}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      <main className="cockpit-main">
        <JourneyPipeline
          journey={journey}
          activeView={activeView}
          onSelectView={handleSelectView}
          onOpenStageContext={(stageNum) => setGovernanceDrawerStage(stageNum)}
        />

        <HeroReadinessBand
          preset={preset}
          mission={mission}
          activeView={activeView}
          onSelectView={handleSelectView}
        />

        <SprintContractStrip
          stageNumber={currentStageNum}
          isReportsView={activeView === "reports"}
          onOpenGovernanceDrawer={() =>
            setGovernanceDrawerStage(currentStageNum)
          }
        />

        {activeView === "gate1" && (
          <Gate1FlightCheck
            preset={preset}
            customStations={mission.customizations.customStations}
            flightCheck={mission.flightCheck}
            selectedStation={mission.selectedStation}
            sweepingIndex={sweepingIndex}
            onSelectStation={(code) =>
              updateCurrentMission((prev) => ({
                ...prev,
                selectedStation: code,
              }))
            }
            onRunFlightCheck={handleRunFlightCheck}
            onApplyStationFix={handleApplyStationFix}
            onIssueWaiver={handleIssueWaiver}
            onRevokeWaiver={handleRevokeWaiver}
            onProceedToGate2={() => handleSelectView("gate2")}
          />
        )}

        {activeView === "gate2" && (
          <Gate2StaticFire
            preset={preset}
            customVectors={mission.customizations.customVectors}
            staticFire={mission.staticFire}
            stagedPatches={mission.stagedVectorPatches}
            isFiring={isFiring}
            onToggleStagePatch={handleToggleStagePatch}
            onStageAllPatches={handleStageAllPatches}
            onIgniteFire={handleIgniteStaticFire}
            onProceedToGate3={() => handleSelectView("gate3")}
          />
        )}

        {activeView === "gate3" && (
          <Gate3CrewDrill
            crewDrill={mission.crewDrill}
            crewSummary={mission.crewSummary}
            onStartAlarm={handleStartAlarm}
            onTickAlarm={handleTickAlarm}
            onApplyRemediation={handleApplyCrewRemediation}
            onProceedToDossier={() => handleSelectView("reports")}
          />
        )}

        {activeView === "reports" && (
          <ReportsDossierHub
            preset={preset}
            mission={mission}
            onUpdateSigners={handleUpdateSigners}
            onToggleSignDossier={handleToggleSignDossier}
          />
        )}
      </main>

      <ScopeGovernanceDrawer
        stage={
          governanceDrawerStage !== null
            ? getStageMetadata(governanceDrawerStage)
            : null
        }
        onClose={() => setGovernanceDrawerStage(null)}
      />

      <LiveWireLogDrawer
        open={wireLogOpen}
        entries={mission.wireLog}
        onClose={() => setWireLogOpen(false)}
      />

      <CustomizeDrawer
        open={customizeOpen}
        preset={preset}
        mission={mission}
        onClose={() => setCustomizeOpen(false)}
        onUpdateCustomizations={handleUpdateCustomizations}
        onApplyYaml={handleApplyYaml}
        onResetCustomizations={handleResetCustomizations}
      />
    </div>
  );
}
