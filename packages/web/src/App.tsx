import { useCallback, useEffect, useMemo, useState } from "react";
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
  type CustomerBlueprint,
  type DossierSigners,
  type ManualGate1Status,
  type ManualGate2Status,
  type ManualGate3Status,
  type StageNumber,
  type StationCode,
  type WaiverInput,
} from "@nominalx/core";
import { CustomizeDrawer } from "./components/CustomizeDrawer";
import { CustomerSetupWizard } from "./components/CustomerSetupWizard";
import {
  ExportImportModal,
  type ExportImportInitialTab,
} from "./components/ExportImportModal";
import { FirstRunLaunchpad } from "./components/FirstRunLaunchpad";
import { Gate1FlightCheck } from "./components/Gate1FlightCheck";
import { Gate2StaticFire } from "./components/Gate2StaticFire";
import { Gate3CrewDrill } from "./components/Gate3CrewDrill";
import { HeroReadinessBand } from "./components/HeroReadinessBand";
import { JourneyPipeline } from "./components/JourneyPipeline";
import { LiveWireLogDrawer } from "./components/LiveWireLogDrawer";
import { MyCustomersEmptyState } from "./components/MyCustomersEmptyState";
import {
  ReportsDossierHub,
  type DeliverableTab,
} from "./components/ReportsDossierHub";
import {
  ScopeGovernanceDrawer,
  SprintContractStrip,
} from "./components/SprintContractStrip";
import { TopMissionBar } from "./components/TopMissionBar";
import { WalkthroughTour } from "./components/WalkthroughTour";
import {
  hasSeenWalkthrough,
  markWalkthroughSeen,
  WALKTHROUGH_STEPS,
} from "./data/walkthroughSteps";
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
  serializeMissionToYaml,
  viewToStageNumber,
  type AccountCustomizations,
  type AccountMissionState,
  type CockpitView,
} from "./state/missionState";
import {
  buildCustomerCockpitModel,
  createCustomerRecordFromBlueprint,
  duplicateCustomerRecord,
  exportCustomerToYaml,
  importCustomerRecordFromYaml,
  loadMyCustomers,
  loadWorkspacePreferences,
  parseWorkspaceBackupJson,
  resolveInitialRoute,
  saveMyCustomers,
  saveWorkspacePreferences,
  setManualGate1Evidence,
  setManualGate1Status,
  setManualGate2Evidence,
  setManualGate2Status,
  setManualGate3Evidence,
  setManualGate3Status,
  updateCustomerRecordBlueprint,
  type AccountKind,
  type ActiveScreen,
  type CustomerWorkspaceRecord,
  type WorkspacePreferences,
} from "./state/workspaceState";

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

  // My Customers workspace & preferences persisted in localStorage
  const [myCustomers, setMyCustomers] = useState<CustomerWorkspaceRecord[]>(() =>
    loadMyCustomers(),
  );
  const [workspacePrefs, setWorkspacePrefs] = useState<WorkspacePreferences>(() =>
    loadWorkspacePreferences(),
  );

  const initialRoute = useMemo(
    () =>
      resolveInitialRoute({
        myCustomers: loadMyCustomers(),
        prefs: loadWorkspacePreferences(),
      }),
    [],
  );

  const [activeScreen, setActiveScreen] = useState<ActiveScreen>(
    initialRoute.screen,
  );
  const [accountKind, setAccountKind] = useState<AccountKind>(
    initialRoute.accountKind,
  );
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(
    initialRoute.customerId,
  );
  const [activePresetId, setActivePresetId] = useState<AccountPresetId>(
    initialRoute.sampleId,
  );

  // Sample Accounts simulation state
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
  const [focusDiffNonce, setFocusDiffNonce] = useState(0);

  // New modals: Guided Setup Wizard + Portable Export/Import
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [exportImportOpen, setExportImportOpen] = useState(false);
  const [exportImportTab, setExportImportTab] =
    useState<ExportImportInitialTab>("import");

  // Walkthrough Tour: NEVER auto-opens on First-Run Launchpad or My Customers
  const [tourOpen, setTourOpen] = useState<boolean>(false);
  const [tourStepIndex, setTourStepIndex] = useState<number>(0);

  // Persist theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage unavailability
    }
  }, [theme]);

  // Persist My Customers
  useEffect(() => {
    saveMyCustomers(myCustomers);
  }, [myCustomers]);

  // Persist Workspace Preferences
  useEffect(() => {
    saveWorkspacePreferences(workspacePrefs);
  }, [workspacePrefs]);

  // Drive live cockpit view and drawers as the user steps through the walkthrough
  useEffect(() => {
    if (!tourOpen) return;
    const step = WALKTHROUGH_STEPS[tourStepIndex];
    if (!step) return;

    setFocusDiffNonce(0);
    setWireLogOpen(false);
    setActiveView(step.view);

    const drawer = step.openDrawer ?? "none";
    setCustomizeOpen(drawer === "customize");
    setGovernanceDrawerStage(
      drawer === "governance" ? viewToStageNumber(step.view) : null,
    );
  }, [tourOpen, tourStepIndex]);

  const activeCustomer = useMemo(
    () =>
      accountKind === "customer" && activeCustomerId
        ? myCustomers.find((c) => c.id === activeCustomerId) ?? null
        : null,
    [accountKind, activeCustomerId, myCustomers],
  );

  const isManualCustomer = Boolean(activeCustomer && activeScreen === "cockpit");

  const customerCockpit = useMemo(
    () => (activeCustomer ? buildCustomerCockpitModel(activeCustomer) : null),
    [activeCustomer],
  );

  const samplePreset = ACCOUNT_PRESETS[activePresetId];
  const sampleMission = missions[activePresetId];

  const preset = customerCockpit ? customerCockpit.virtualPreset : samplePreset;
  const mission = customerCockpit ? customerCockpit.mission : sampleMission;
  const journey = computeMissionJourney(mission);
  const currentStageNum = viewToStageNumber(activeView);
  const customCount = countActiveCustomizations(sampleMission.customizations);

  const updateCurrentSampleMission = useCallback(
    (updater: (prev: AccountMissionState) => AccountMissionState) => {
      setMissions((prev) => ({
        ...prev,
        [activePresetId]: updater(prev[activePresetId]),
      }));
    },
    [activePresetId],
  );

  const updateActiveCustomer = useCallback(
    (updater: (prev: CustomerWorkspaceRecord) => CustomerWorkspaceRecord) => {
      if (!activeCustomerId) return;
      setMyCustomers((prev) =>
        prev.map((c) => (c.id === activeCustomerId ? updater(c) : c)),
      );
    },
    [activeCustomerId],
  );

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  // Launchpad & Workspace Navigation
  const handleOpenLaunchpad = () => {
    setTourOpen(false);
    setCustomizeOpen(false);
    setGovernanceDrawerStage(null);
    setWireLogOpen(false);
    setActiveScreen("launchpad");
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const handleStartNewCustomer = () => {
    setTourOpen(false);
    setEditingCustomerId(null);
    setWizardOpen(true);
  };

  const handleEditCustomer = (customerId: string) => {
    setTourOpen(false);
    setEditingCustomerId(customerId);
    setWizardOpen(true);
  };

  const handleCompleteWizard = (
    blueprint: CustomerBlueprint,
    editId?: string | null,
  ) => {
    if (editId) {
      setMyCustomers((prev) =>
        prev.map((c) =>
          c.id === editId ? updateCustomerRecordBlueprint(c, blueprint) : c,
        ),
      );
      setActiveCustomerId(editId);
      setAccountKind("customer");
      setActiveScreen("cockpit");
      setWorkspacePrefs((prev) => ({
        ...prev,
        launchpadDismissed: true,
        lastActiveCustomerId: editId,
      }));
    } else {
      const record = createCustomerRecordFromBlueprint(
        blueprint,
        myCustomers.map((c) => c.id),
      );
      setMyCustomers((prev) => [record, ...prev]);
      setActiveCustomerId(record.id);
      setAccountKind("customer");
      setActiveScreen("cockpit");
      setActiveView("gate1");
      setWorkspacePrefs((prev) => ({
        ...prev,
        launchpadDismissed: true,
        lastActiveCustomerId: record.id,
      }));
    }
    setWizardOpen(false);
    setEditingCustomerId(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const handleSelectCustomer = (customerId: string) => {
    setTourOpen(false);
    setCustomizeOpen(false);
    setFocusDiffNonce(0);
    setActiveCustomerId(customerId);
    setAccountKind("customer");
    setActiveScreen("cockpit");
    setActiveView("gate1");
    setWorkspacePrefs((prev) => ({
      ...prev,
      launchpadDismissed: true,
      lastActiveCustomerId: customerId,
    }));
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const handleShowEmptyCustomers = () => {
    setTourOpen(false);
    setCustomizeOpen(false);
    setActiveScreen("empty_customers");
    setAccountKind("customer");
    setActiveCustomerId(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const handleDuplicateCustomer = (customerId: string) => {
    const source = myCustomers.find((c) => c.id === customerId);
    if (!source) return;
    const copy = duplicateCustomerRecord(
      source,
      myCustomers.map((c) => c.id),
    );
    setMyCustomers((prev) => [copy, ...prev]);
    setActiveCustomerId(copy.id);
    setAccountKind("customer");
    setActiveScreen("cockpit");
    setWorkspacePrefs((prev) => ({
      ...prev,
      launchpadDismissed: true,
      lastActiveCustomerId: copy.id,
    }));
  };

  const handleDeleteCustomer = (customerId: string) => {
    const remaining = myCustomers.filter((c) => c.id !== customerId);
    setMyCustomers(remaining);
    if (activeCustomerId === customerId) {
      if (remaining.length > 0) {
        const nextId = remaining[0]!.id;
        setActiveCustomerId(nextId);
        setAccountKind("customer");
        setActiveScreen("cockpit");
        setWorkspacePrefs((prev) => ({ ...prev, lastActiveCustomerId: nextId }));
      } else {
        setActiveCustomerId(null);
        setActiveScreen("empty_customers");
        setWorkspacePrefs((prev) => ({ ...prev, lastActiveCustomerId: undefined }));
      }
    }
  };

  const handleSelectSample = (id: AccountPresetId) => {
    setFocusDiffNonce(0);
    setActivePresetId(id);
    setAccountKind("sample");
    setActiveScreen("cockpit");
    setSweepingIndex(null);
    setIsFiring(false);
    setWorkspacePrefs((prev) => ({
      ...prev,
      launchpadDismissed: true,
      lastActiveSampleId: id,
    }));
  };

  const handleExploreSamplesFromLaunchpad = () => {
    setFocusDiffNonce(0);
    setActivePresetId("meridian-fintech");
    setAccountKind("sample");
    setActiveScreen("cockpit");
    setActiveView("gate1");
    setSweepingIndex(null);
    setIsFiring(false);
    setWorkspacePrefs((prev) => ({
      ...prev,
      launchpadDismissed: true,
      lastActiveSampleId: "meridian-fintech",
    }));
    window.scrollTo({ top: 0, behavior: "instant" });
    if (!hasSeenWalkthrough()) {
      setTourStepIndex(0);
      setTourOpen(true);
    }
  };

  const handleOpenTour = () => {
    setFocusDiffNonce(0);
    setWireLogOpen(false);
    setCustomizeOpen(false);
    setWizardOpen(false);
    setExportImportOpen(false);
    setGovernanceDrawerStage(null);
    // Ensure Meridian FinTech sample cockpit is active so all 21 spotlight targets exist cleanly
    setActivePresetId("meridian-fintech");
    setAccountKind("sample");
    setActiveScreen("cockpit");
    setActiveView("gate1");
    setWorkspacePrefs((prev) => ({
      ...prev,
      launchpadDismissed: true,
      lastActiveSampleId: "meridian-fintech",
    }));
    setTourStepIndex(0);
    setTourOpen(true);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const handleCloseTour = useCallback(() => {
    markWalkthroughSeen();
    setTourOpen(false);
    setCustomizeOpen(false);
    setGovernanceDrawerStage(null);
    setWireLogOpen(false);
    setFocusDiffNonce(0);
    setActiveView("gate1");
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  const handleSelectView = (view: CockpitView) => {
    setFocusDiffNonce(0);
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const handleInspectHardStop = (stationCode: StationCode) => {
    setActiveView("gate1");
    if (isManualCustomer) {
      updateActiveCustomer((prev) => ({
        ...prev,
        selectedStation: stationCode,
      }));
    } else {
      updateCurrentSampleMission((prev) => ({
        ...prev,
        selectedStation: stationCode,
      }));
    }
    setFocusDiffNonce((n) => n + 1);
  };

  // Reset Scenario is strictly scoped to Sample Accounts — never touches My Customers
  const handleResetScenario = () => {
    if (accountKind !== "sample") return;
    clearStoredCustomizations(activePresetId);
    setFocusDiffNonce(0);
    setSweepingIndex(null);
    setIsFiring(false);
    setMissions((prev) => ({
      ...prev,
      [activePresetId]: createInitialMissionState(activePresetId, {
        skipStorage: true,
      }),
    }));
  };

  const handleOpenExportImport = (initialTab: ExportImportInitialTab) => {
    setTourOpen(false);
    setExportImportTab(initialTab);
    setExportImportOpen(true);
  };

  const handleImportYaml = (
    yamlText: string,
  ): { ok: boolean; errors?: ConfigValidationError[]; importedName?: string } => {
    const res = importCustomerRecordFromYaml(
      yamlText,
      myCustomers.map((c) => c.id),
    );
    if (!res.ok) return { ok: false, errors: res.errors };
    setMyCustomers((prev) => [res.record, ...prev]);
    setActiveCustomerId(res.record.id);
    setAccountKind("customer");
    setActiveScreen("cockpit");
    setActiveView("gate1");
    setWorkspacePrefs((prev) => ({
      ...prev,
      launchpadDismissed: true,
      lastActiveCustomerId: res.record.id,
    }));
    return { ok: true, importedName: res.record.config.account.name };
  };

  const handleImportWorkspaceJson = (
    jsonText: string,
  ): { ok: boolean; errors?: ConfigValidationError[]; importedCount?: number } => {
    const res = parseWorkspaceBackupJson(
      jsonText,
      myCustomers.map((c) => c.id),
    );
    if (!res.ok) return { ok: false, errors: res.errors };
    setMyCustomers((prev) => [...res.imported, ...prev]);
    const first = res.imported[0]!;
    setActiveCustomerId(first.id);
    setAccountKind("customer");
    setActiveScreen("cockpit");
    setActiveView("gate1");
    setWorkspacePrefs((prev) => ({
      ...prev,
      launchpadDismissed: true,
      lastActiveCustomerId: first.id,
    }));
    return { ok: true, importedCount: res.imported.length };
  };

  // Sample Customize Drawer handlers
  const handleUpdateCustomizations = (next: AccountCustomizations) => {
    saveStoredCustomizations(activePresetId, next);
    updateCurrentSampleMission((prev) =>
      applyCustomizationsToMission(samplePreset, prev, next),
    );
  };

  const handleApplyYaml = (
    yamlText: string,
  ): { ok: boolean; errors?: ConfigValidationError[] } => {
    const res = applyYamlToMission(samplePreset, sampleMission, yamlText);
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

  // Manual Customer Gate 1 / 2 / 3 handlers
  const handleManualSetGate1Status = (
    code: StationCode,
    status: ManualGate1Status,
    waiver?: WaiverInput,
  ): { ok: boolean; error?: string } => {
    if (!activeCustomer) return { ok: false, error: "No active customer selected." };
    const res = setManualGate1Status(activeCustomer, code, status, waiver);
    if (!res.ok) return { ok: false, error: res.error };
    setMyCustomers((prev) =>
      prev.map((c) => (c.id === activeCustomer.id ? res.record : c)),
    );
    return { ok: true };
  };

  const handleManualSetGate1Evidence = (code: StationCode, note: string) => {
    updateActiveCustomer((prev) => setManualGate1Evidence(prev, code, note));
  };

  const handleManualSetGate2Status = (
    vectorId: string,
    status: ManualGate2Status,
  ) => {
    updateActiveCustomer((prev) => setManualGate2Status(prev, vectorId, status));
  };

  const handleManualSetGate2Evidence = (vectorId: string, note: string) => {
    updateActiveCustomer((prev) => setManualGate2Evidence(prev, vectorId, note));
  };

  const handleManualSetGate3Status = (
    alarmId: string,
    status: ManualGate3Status,
    splitSeconds?: number,
  ) => {
    updateActiveCustomer((prev) =>
      setManualGate3Status(prev, alarmId, status, splitSeconds),
    );
  };

  const handleManualSetGate3Evidence = (alarmId: string, note: string) => {
    updateActiveCustomer((prev) => setManualGate3Evidence(prev, alarmId, note));
  };

  // Sample Gate 1 handlers
  const handleRunFlightCheck = () => {
    if (sweepingIndex !== null || isManualCustomer) return;
    const totalStations = sampleMission.flightCheck.stations.length;
    setSweepingIndex(0);
    let idx = 0;
    const interval = window.setInterval(() => {
      idx += 1;
      if (idx >= totalStations) {
        window.clearInterval(interval);
        setSweepingIndex(null);
        updateCurrentSampleMission((prev) => {
          const fresh = evaluatePresetFlightCheck(
            samplePreset,
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
    if (isManualCustomer) return;
    updateCurrentSampleMission((prev) => {
      const nextPatched = prev.patchedStations.includes(code)
        ? prev.patchedStations
        : [...prev.patchedStations, code];
      const nextFlightCheck = evaluatePresetFlightCheck(
        samplePreset,
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
    if (isManualCustomer) return;
    updateCurrentSampleMission((prev) => {
      const code = waiver.station as StationCode;
      const nextCustom = [
        ...prev.customWaivers.filter((w) => w.station !== waiver.station),
        waiver,
      ];
      const nextRemoved = prev.removedPresetWaiverStations.filter(
        (s) => s !== code,
      );
      const nextFlightCheck = evaluatePresetFlightCheck(
        samplePreset,
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
    if (isManualCustomer) {
      handleManualSetGate1Status(code, "PENDING");
      return;
    }
    updateCurrentSampleMission((prev) => {
      const nextCustom = prev.customWaivers.filter(
        (w) => w.station.toUpperCase() !== code.toUpperCase(),
      );
      const nextRemoved = prev.removedPresetWaiverStations.includes(code)
        ? prev.removedPresetWaiverStations
        : [...prev.removedPresetWaiverStations, code];
      const nextFlightCheck = evaluatePresetFlightCheck(
        samplePreset,
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

  // Sample Gate 2 handlers
  const handleToggleStagePatch = (vectorId: ChaosVectorId) => {
    updateCurrentSampleMission((prev) => {
      const exists = prev.stagedVectorPatches.includes(vectorId);
      const next = exists
        ? prev.stagedVectorPatches.filter((id) => id !== vectorId)
        : [...prev.stagedVectorPatches, vectorId];
      return { ...prev, stagedVectorPatches: next };
    });
  };

  const handleStageAllPatches = () => {
    updateCurrentSampleMission((prev) => {
      const activeIds = new Set(prev.staticFire.vectors.map((v) => v.vectorId));
      const builtInIds = samplePreset.patchDiffs
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
    if (isFiring || isManualCustomer) return;
    setIsFiring(true);
    window.setTimeout(() => {
      updateCurrentSampleMission((prev) => {
        const effectiveConfig = getEffectiveConfigForMission(samplePreset, prev);
        const nextAttempt = prev.staticFire.attemptNumber + 1;
        const freshFire = evaluateMissionStaticFire(
          samplePreset,
          effectiveConfig,
          {
            patchedVectors: prev.stagedVectorPatches,
            attemptNumber: nextAttempt,
            previousAttempts: prev.staticFire.attemptHistory,
          },
        );
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

  // Gate 3 Crew Drill handlers (supports both Sample Accounts and live drill runs on My Customers)
  const handleStartAlarm = (alarmId: CrewAlarmId) => {
    if (isManualCustomer) {
      // Starting live drill on manual customer keeps current manual state ready for remediation
      return;
    }
    updateCurrentSampleMission((prev) => {
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
      if (isManualCustomer) return;
      updateCurrentSampleMission((prev) => {
        const nextDrill = tickCrewAlarm(prev.crewDrill, alarmId, elapsedSeconds);
        return {
          ...prev,
          crewDrill: nextDrill,
          crewSummary: summarizeCrewDrill(nextDrill),
        };
      });
    },
    [isManualCustomer, updateCurrentSampleMission],
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
    if (isManualCustomer) {
      if (attempt.accepted) {
        updateActiveCustomer((prev) =>
          setManualGate3Status(prev, alarmId, "PASS", elapsedSeconds),
        );
      }
      return { accepted: attempt.accepted, message: attempt.message };
    }

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
    updateCurrentSampleMission((prev) => ({
      ...prev,
      crewDrill: attempt.state,
      crewSummary: summarizeCrewDrill(attempt.state),
      wireLog: [entry, ...prev.wireLog].slice(0, 60),
    }));
    return { accepted: attempt.accepted, message: attempt.message };
  };

  const handleUpdateSigners = (signers: DossierSigners) => {
    if (isManualCustomer) {
      updateActiveCustomer((prev) => ({ ...prev, signers }));
    } else {
      updateCurrentSampleMission((prev) => ({ ...prev, signers }));
    }
  };

  const handleToggleSignDossier = () => {
    if (isManualCustomer) {
      updateActiveCustomer((prev) => {
        const nextSigned = !prev.dossierSigned;
        const entry = createWireEntry(
          "GOVERNANCE",
          "SIGN",
          `/dossier/${prev.id}/seal`,
          200,
          8,
          nextSigned
            ? `HANDOVER DOSSIER SIGNED · Lead FDE ${prev.signers.leadFde} + Customer Lead ${prev.signers.customerEngLead}`
            : `DOSSIER SEAL REOPENED FOR EDITS`,
          [`Target Go-Live: ${prev.config.account.target_go_live}`],
        );
        return {
          ...prev,
          dossierSigned: nextSigned,
          wireLog: [entry, ...prev.wireLog].slice(0, 60),
        };
      });
      return;
    }

    updateCurrentSampleMission((prev) => {
      const nextSigned = !prev.dossierSigned;
      const effectiveConfig = getEffectiveConfigForMission(samplePreset, prev);
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

  const activeExportYaml = activeCustomer
    ? exportCustomerToYaml(activeCustomer)
    : serializeMissionToYaml(samplePreset, sampleMission);
  const activeExportName = activeCustomer
    ? activeCustomer.config.account.name
    : samplePreset.config.account.name;
  const activeExportSlug = activeCustomer
    ? activeCustomer.id
    : samplePreset.config.account.id;

  const editingCustomerRecord = editingCustomerId
    ? myCustomers.find((c) => c.id === editingCustomerId) ?? null
    : null;

  const forcedDeliverableTab: DeliverableTab | null =
    tourOpen && WALKTHROUGH_STEPS[tourStepIndex]?.id === "reports-signed-dossier"
      ? "dossier"
      : null;

  return (
    <div className="app-shell">
      <TopMissionBar
        activeScreen={activeScreen}
        accountKind={accountKind}
        activeCustomerId={activeCustomerId}
        activeSampleId={activePresetId}
        myCustomers={myCustomers}
        onOpenLaunchpad={handleOpenLaunchpad}
        onStartNewCustomer={handleStartNewCustomer}
        onSelectCustomer={handleSelectCustomer}
        onShowEmptyCustomers={handleShowEmptyCustomers}
        onDuplicateCustomer={handleDuplicateCustomer}
        onEditCustomer={handleEditCustomer}
        onDeleteCustomer={handleDeleteCustomer}
        onSelectSample={handleSelectSample}
        onOpenExportImport={handleOpenExportImport}
        onResetSample={handleResetScenario}
        onOpenCustomize={() => setCustomizeOpen(true)}
        customCount={customCount}
        onOpenWireLog={() => setWireLogOpen(true)}
        wireLogCount={mission.wireLog.length}
        onOpenTour={handleOpenTour}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      <main className="cockpit-main">
        {activeScreen === "launchpad" && (
          <FirstRunLaunchpad
            myCustomers={myCustomers}
            onStartSetupWizard={handleStartNewCustomer}
            onExploreSamples={handleExploreSamplesFromLaunchpad}
            onOpenImport={() => handleOpenExportImport("import")}
            onSelectCustomer={handleSelectCustomer}
          />
        )}

        {activeScreen === "empty_customers" && (
          <MyCustomersEmptyState
            onAddFirstCustomer={handleStartNewCustomer}
            onImportYaml={() => handleOpenExportImport("import")}
            onExploreSamples={handleExploreSamplesFromLaunchpad}
          />
        )}

        {activeScreen === "cockpit" && (
          <>
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
              onInspectHardStop={handleInspectHardStop}
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
                focusDiffNonce={focusDiffNonce}
                isManualCustomer={isManualCustomer}
                blueprint={activeCustomer?.blueprint ?? null}
                manualState={activeCustomer?.manualState ?? null}
                onManualSetStatus={handleManualSetGate1Status}
                onManualSetEvidence={handleManualSetGate1Evidence}
                onOpenExportYaml={() => handleOpenExportImport("export")}
                onSelectStation={(code) => {
                  if (isManualCustomer) {
                    updateActiveCustomer((prev) => ({
                      ...prev,
                      selectedStation: code,
                    }));
                  } else {
                    updateCurrentSampleMission((prev) => ({
                      ...prev,
                      selectedStation: code,
                    }));
                  }
                }}
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
                isManualCustomer={isManualCustomer}
                blueprint={activeCustomer?.blueprint ?? null}
                manualState={activeCustomer?.manualState ?? null}
                onManualSetVectorStatus={handleManualSetGate2Status}
                onManualSetVectorEvidence={handleManualSetGate2Evidence}
                onOpenExportYaml={() => handleOpenExportImport("export")}
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
                isManualCustomer={isManualCustomer}
                blueprint={activeCustomer?.blueprint ?? null}
                manualState={activeCustomer?.manualState ?? null}
                onManualSetDrillStatus={handleManualSetGate3Status}
                onManualSetDrillEvidence={handleManualSetGate3Evidence}
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
                blueprint={activeCustomer?.blueprint ?? null}
                manualState={activeCustomer?.manualState ?? null}
                forceTab={forcedDeliverableTab}
                onUpdateSigners={handleUpdateSigners}
                onToggleSignDossier={handleToggleSignDossier}
              />
            )}
          </>
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
        preset={samplePreset}
        mission={sampleMission}
        onClose={() => setCustomizeOpen(false)}
        onUpdateCustomizations={handleUpdateCustomizations}
        onApplyYaml={handleApplyYaml}
        onResetCustomizations={handleResetCustomizations}
      />

      <CustomerSetupWizard
        open={wizardOpen}
        editingCustomerId={editingCustomerId}
        initialBlueprint={editingCustomerRecord?.blueprint ?? null}
        onClose={() => {
          setWizardOpen(false);
          setEditingCustomerId(null);
        }}
        onComplete={handleCompleteWizard}
      />

      <ExportImportModal
        open={exportImportOpen}
        initialTab={exportImportTab}
        activeCustomerName={activeExportName}
        activeCustomerSlug={activeExportSlug}
        activeCustomerYaml={activeExportYaml}
        myCustomers={myCustomers}
        onClose={() => setExportImportOpen(false)}
        onImportYaml={handleImportYaml}
        onImportWorkspaceJson={handleImportWorkspaceJson}
      />

      <WalkthroughTour
        open={tourOpen}
        stepIndex={tourStepIndex}
        onChangeStep={setTourStepIndex}
        onComplete={handleCloseTour}
        onSkip={handleCloseTour}
      />
    </div>
  );
}
