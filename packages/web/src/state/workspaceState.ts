import {
  ACCOUNT_PRESETS,
  blueprintFromNominalXConfig,
  compileBlueprintToConfig,
  createInitialManualGateState,
  evaluateManualCustomerGates,
  parseNominalXConfigYaml,
  serializeNominalXConfigYaml,
  todayIsoUtc,
  validateManualWaiver,
  type AccountPreset,
  type AccountPresetId,
  type ConfigValidationError,
  type CustomerBlueprint,
  type DossierSigners,
  type ManualGate1Status,
  type ManualGate2Status,
  type ManualGate3Status,
  type ManualGateState,
  type NominalXConfig,
  type StationCode,
  type WaiverInput,
} from "@nominalx/core";
import {
  createEmptyCustomizations,
  createWireEntry,
  type AccountMissionState,
  type WireLogEntry,
} from "./missionState";

export const MY_CUSTOMERS_STORAGE_KEY = "nominalx-my-customers-v1";
export const WORKSPACE_PREFS_STORAGE_KEY = "nominalx-workspace-prefs-v1";

export type ActiveScreen = "launchpad" | "cockpit" | "empty_customers";
export type AccountKind = "customer" | "sample";

export interface CustomerWorkspaceRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  config: NominalXConfig;
  blueprint: CustomerBlueprint;
  manualState: ManualGateState;
  signers: DossierSigners;
  dossierSigned: boolean;
  selectedStation: StationCode;
  wireLog: WireLogEntry[];
}

export interface WorkspacePreferences {
  launchpadDismissed: boolean;
  lastActiveCustomerId?: string;
  lastActiveSampleId?: AccountPresetId;
}

export interface WorkspaceBackupV1 {
  format: "nominalx-workspace-backup";
  schemaVersion: "1.0";
  exportedAt: string;
  customers: CustomerWorkspaceRecord[];
}

export interface InitialRouteResolution {
  screen: ActiveScreen;
  accountKind: AccountKind;
  customerId: string | null;
  sampleId: AccountPresetId;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function getDefaultStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadWorkspacePreferences(
  storage?: StorageLike | null,
): WorkspacePreferences {
  const store = storage === undefined ? getDefaultStorage() : storage;
  if (!store) return { launchpadDismissed: false };
  try {
    const raw = store.getItem(WORKSPACE_PREFS_STORAGE_KEY);
    if (!raw) return { launchpadDismissed: false };
    const parsed = JSON.parse(raw) as Partial<WorkspacePreferences>;
    return {
      launchpadDismissed: Boolean(parsed.launchpadDismissed),
      lastActiveCustomerId:
        typeof parsed.lastActiveCustomerId === "string"
          ? parsed.lastActiveCustomerId
          : undefined,
      lastActiveSampleId:
        parsed.lastActiveSampleId &&
        parsed.lastActiveSampleId in ACCOUNT_PRESETS
          ? parsed.lastActiveSampleId
          : undefined,
    };
  } catch {
    return { launchpadDismissed: false };
  }
}

export function saveWorkspacePreferences(
  prefs: WorkspacePreferences,
  storage?: StorageLike | null,
): void {
  const store = storage === undefined ? getDefaultStorage() : storage;
  if (!store) return;
  try {
    store.setItem(WORKSPACE_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage unavailability
  }
}

export function loadMyCustomers(
  storage?: StorageLike | null,
): CustomerWorkspaceRecord[] {
  const store = storage === undefined ? getDefaultStorage() : storage;
  if (!store) return [];
  try {
    const raw = store.getItem(MY_CUSTOMERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CustomerWorkspaceRecord =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        Boolean(item.config) &&
        Boolean(item.blueprint) &&
        Boolean(item.manualState),
    );
  } catch {
    return [];
  }
}

export function saveMyCustomers(
  customers: readonly CustomerWorkspaceRecord[],
  storage?: StorageLike | null,
): void {
  const store = storage === undefined ? getDefaultStorage() : storage;
  if (!store) return;
  try {
    store.setItem(MY_CUSTOMERS_STORAGE_KEY, JSON.stringify(customers));
  } catch {
    // Ignore storage unavailability
  }
}

/**
 * Deterministic entry routing:
 * - Returning visitors with >= 1 customer in My Customers open straight into
 *   their most recently active customer automatically.
 * - Brand-new visitors (0 customers and launchpad not dismissed) land on the
 *   First-Run Launchpad before entering any sample dashboard.
 * - Visitors who dismissed the launchpad (e.g. exploring samples) with 0
 *   customers open into their last active sample account.
 */
export function resolveInitialRoute(input: {
  myCustomers: readonly CustomerWorkspaceRecord[];
  prefs: WorkspacePreferences;
}): InitialRouteResolution {
  const defaultSample: AccountPresetId =
    input.prefs.lastActiveSampleId ?? "meridian-fintech";

  if (input.myCustomers.length > 0) {
    const matched = input.prefs.lastActiveCustomerId
      ? input.myCustomers.find((c) => c.id === input.prefs.lastActiveCustomerId)
      : undefined;
    const mostRecent = [...input.myCustomers].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    )[0]!;
    return {
      screen: "cockpit",
      accountKind: "customer",
      customerId: (matched ?? mostRecent).id,
      sampleId: defaultSample,
    };
  }

  if (input.prefs.launchpadDismissed) {
    return {
      screen: "cockpit",
      accountKind: "sample",
      customerId: null,
      sampleId: defaultSample,
    };
  }

  return {
    screen: "launchpad",
    accountKind: "sample",
    customerId: null,
    sampleId: defaultSample,
  };
}

export function ensureUniqueCustomerSlug(
  desiredSlug: string,
  existingIds: readonly string[],
): string {
  const clean =
    desiredSlug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "customer-launch";
  const taken = new Set(existingIds.map((id) => id.toLowerCase()));
  if (!taken.has(clean)) return clean;
  let suffix = 2;
  while (taken.has(`${clean}-${suffix}`)) {
    suffix += 1;
  }
  return `${clean}-${suffix}`;
}

export function createCustomerRecordFromBlueprint(
  blueprint: CustomerBlueprint,
  existingIds: readonly string[],
  nowIso: string = new Date().toISOString(),
): CustomerWorkspaceRecord {
  const uniqueSlug = ensureUniqueCustomerSlug(blueprint.slug, existingIds);
  const normalizedBlueprint: CustomerBlueprint = {
    ...blueprint,
    slug: uniqueSlug,
  };
  const config = compileBlueprintToConfig(normalizedBlueprint);
  const manualState = createInitialManualGateState(
    normalizedBlueprint,
    config.waivers,
  );
  const firstStation =
    normalizedBlueprint.gate1Items.find((i) => i.enabled)?.id ?? "AUTH_SSO";

  const wireLog: WireLogEntry[] = [
    createWireEntry(
      "GOVERNANCE",
      "SIGN",
      `/customers/${uniqueSlug}/blueprint`,
      200,
      4,
      `CREATED CUSTOMER BLUEPRINT · ${config.account.name} (${normalizedBlueprint.gate1Items.filter((i) => i.enabled).length} G1 · ${normalizedBlueprint.gate2Items.filter((i) => i.enabled).length} G2 · ${normalizedBlueprint.gate3Items.filter((i) => i.enabled).length} G3)`,
      [
        `Deployment: ${normalizedBlueprint.input.deploymentModel}`,
        `Target Go-Live: ${config.account.target_go_live}`,
      ],
    ),
  ];

  return {
    id: uniqueSlug,
    createdAt: nowIso,
    updatedAt: nowIso,
    config,
    blueprint: normalizedBlueprint,
    manualState,
    signers: {
      leadFde: config.account.fde_owner,
      leadCse: config.account.cse_owner,
      customerEngLead: config.account.customer_eng_lead,
      supportAckOwner: config.account.support_owner ?? "support-oncall@vendor.io",
      signedAt: nowIso,
    },
    dossierSigned: false,
    selectedStation: firstStation,
    wireLog,
  };
}

export function updateCustomerRecordBlueprint(
  existing: CustomerWorkspaceRecord,
  nextBlueprint: CustomerBlueprint,
  nowIso: string = new Date().toISOString(),
): CustomerWorkspaceRecord {
  const normalizedBlueprint: CustomerBlueprint = {
    ...nextBlueprint,
    slug: existing.id,
  };
  const nextConfig = compileBlueprintToConfig(normalizedBlueprint);
  const freshManual = createInitialManualGateState(
    normalizedBlueprint,
    nextConfig.waivers,
  );

  // Preserve existing manual statuses & evidence notes for items still present
  const mergedGate1 = { ...freshManual.gate1 };
  for (const [id, entry] of Object.entries(existing.manualState.gate1)) {
    if (id in mergedGate1) {
      const bpItem = normalizedBlueprint.gate1Items.find((i) => i.id === id);
      // If an operational station was promoted to Hard Stop, strip any old waiver
      if (bpItem?.isHardStop && entry.status === "WAIVED") {
        mergedGate1[id] = {
          status: "PENDING",
          evidenceNote: entry.evidenceNote,
          updatedAt: nowIso,
        };
      } else {
        mergedGate1[id] = entry;
      }
    }
  }

  const mergedGate2 = { ...freshManual.gate2 };
  for (const [id, entry] of Object.entries(existing.manualState.gate2)) {
    if (id in mergedGate2) mergedGate2[id] = entry;
  }

  const mergedGate3 = { ...freshManual.gate3 };
  for (const [id, entry] of Object.entries(existing.manualState.gate3)) {
    if (id in mergedGate3) mergedGate3[id] = entry;
  }

  const enabledG1Ids = new Set(
    normalizedBlueprint.gate1Items.filter((i) => i.enabled).map((i) => i.id),
  );
  const selectedStation = enabledG1Ids.has(existing.selectedStation)
    ? existing.selectedStation
    : (normalizedBlueprint.gate1Items.find((i) => i.enabled)?.id ?? "AUTH_SSO");

  const logEntry = createWireEntry(
    "GOVERNANCE",
    "PATCH",
    `/customers/${existing.id}/blueprint`,
    200,
    5,
    `UPDATED BLUEPRINT · ${nextConfig.account.name}`,
    [
      `Active items: ${normalizedBlueprint.gate1Items.filter((i) => i.enabled).length} G1, ${normalizedBlueprint.gate2Items.filter((i) => i.enabled).length} G2, ${normalizedBlueprint.gate3Items.filter((i) => i.enabled).length} G3`,
    ],
  );

  return {
    ...existing,
    updatedAt: nowIso,
    config: nextConfig,
    blueprint: normalizedBlueprint,
    manualState: {
      gate1: mergedGate1,
      gate2: mergedGate2,
      gate3: mergedGate3,
    },
    signers: {
      ...existing.signers,
      leadFde: nextConfig.account.fde_owner,
      leadCse: nextConfig.account.cse_owner,
      customerEngLead: nextConfig.account.customer_eng_lead,
    },
    selectedStation,
    wireLog: [logEntry, ...existing.wireLog].slice(0, 60),
  };
}

export function duplicateCustomerRecord(
  source: CustomerWorkspaceRecord,
  existingIds: readonly string[],
  nowIso: string = new Date().toISOString(),
): CustomerWorkspaceRecord {
  const newId = ensureUniqueCustomerSlug(`${source.id}-copy`, existingIds);
  const newName = `${source.config.account.name} (Copy)`;
  const clonedBlueprint: CustomerBlueprint = {
    ...JSON.parse(JSON.stringify(source.blueprint)),
    slug: newId,
    input: {
      ...JSON.parse(JSON.stringify(source.blueprint.input)),
      companyName: newName,
    },
  };
  const clonedConfig: NominalXConfig = {
    ...JSON.parse(JSON.stringify(source.config)),
    account: {
      ...JSON.parse(JSON.stringify(source.config.account)),
      id: newId,
      name: newName,
    },
  };
  return {
    ...JSON.parse(JSON.stringify(source)),
    id: newId,
    createdAt: nowIso,
    updatedAt: nowIso,
    config: clonedConfig,
    blueprint: clonedBlueprint,
    dossierSigned: false,
    wireLog: [
      createWireEntry(
        "GOVERNANCE",
        "SIGN",
        `/customers/${newId}/duplicate`,
        200,
        3,
        `DUPLICATED CUSTOMER · ${newName} from ${source.config.account.name}`,
        [],
      ),
      ...source.wireLog.slice(0, 20),
    ],
  };
}

export function importCustomerRecordFromYaml(
  yamlText: string,
  existingIds: readonly string[],
  nowIso: string = new Date().toISOString(),
):
  | { ok: true; record: CustomerWorkspaceRecord }
  | { ok: false; errors: ConfigValidationError[] } {
  const parsed = parseNominalXConfigYaml(yamlText);
  if (!parsed.ok) {
    return { ok: false, errors: parsed.errors };
  }
  const cfg = parsed.config;
  const uniqueId = ensureUniqueCustomerSlug(cfg.account.id, existingIds);
  const normalizedConfig: NominalXConfig = {
    ...cfg,
    account: {
      ...cfg.account,
      id: uniqueId,
    },
  };
  const blueprint = blueprintFromNominalXConfig(normalizedConfig);
  const manualState = createInitialManualGateState(
    blueprint,
    normalizedConfig.waivers,
  );
  const firstStation =
    blueprint.gate1Items.find((i) => i.enabled)?.id ?? "AUTH_SSO";

  const record: CustomerWorkspaceRecord = {
    id: uniqueId,
    createdAt: nowIso,
    updatedAt: nowIso,
    config: normalizedConfig,
    blueprint,
    manualState,
    signers: {
      leadFde: normalizedConfig.account.fde_owner,
      leadCse: normalizedConfig.account.cse_owner,
      customerEngLead: normalizedConfig.account.customer_eng_lead,
      supportAckOwner:
        normalizedConfig.account.support_owner ?? "support-oncall@vendor.io",
      signedAt: nowIso,
    },
    dossierSigned: false,
    selectedStation: firstStation,
    wireLog: [
      createWireEntry(
        "GOVERNANCE",
        "SIGN",
        `/customers/${uniqueId}/import-yaml`,
        200,
        5,
        `IMPORTED NOMINALX.YAML · ${normalizedConfig.account.name}`,
        [
          `Stations: ${blueprint.gate1Items.filter((i) => i.enabled).length} · Vectors: ${blueprint.gate2Items.filter((i) => i.enabled).length} · Drills: ${blueprint.gate3Items.filter((i) => i.enabled).length}`,
        ],
      ),
    ],
  };

  return { ok: true, record };
}

export function exportCustomerToYaml(record: CustomerWorkspaceRecord): string {
  const evaluated = evaluateManualCustomerGates({
    config: record.config,
    blueprint: record.blueprint,
    manualState: record.manualState,
    referenceDate: todayIsoUtc(),
  });
  const configWithActiveWaivers: NominalXConfig = {
    ...record.config,
    waivers: evaluated.effectiveWaivers,
  };
  return serializeNominalXConfigYaml(configWithActiveWaivers);
}

export function exportWorkspaceBackupJson(
  customers: readonly CustomerWorkspaceRecord[],
  exportedAt: string = new Date().toISOString(),
): string {
  const payload: WorkspaceBackupV1 = {
    format: "nominalx-workspace-backup",
    schemaVersion: "1.0",
    exportedAt,
    customers: [...customers],
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function parseWorkspaceBackupJson(
  jsonText: string,
  existingIds: readonly string[],
):
  | { ok: true; imported: CustomerWorkspaceRecord[] }
  | { ok: false; errors: ConfigValidationError[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (err) {
    return {
      ok: false,
      errors: [
        {
          path: "(json)",
          message:
            err instanceof Error
              ? `Invalid JSON syntax: ${err.message}`
              : "Invalid JSON syntax",
        },
      ],
    };
  }

  if (
    !raw ||
    typeof raw !== "object" ||
    (raw as Partial<WorkspaceBackupV1>).format !== "nominalx-workspace-backup" ||
    !Array.isArray((raw as Partial<WorkspaceBackupV1>).customers)
  ) {
    return {
      ok: false,
      errors: [
        {
          path: "format",
          message:
            'File is not a valid NominalX workspace backup (.json). Expected format: "nominalx-workspace-backup" with a "customers" array.',
        },
      ],
    };
  }

  const list = (raw as WorkspaceBackupV1).customers;
  if (list.length === 0) {
    return {
      ok: false,
      errors: [
        {
          path: "customers",
          message: "Workspace backup contains 0 customers to import.",
        },
      ],
    };
  }

  const runningIds = [...existingIds];
  const imported: CustomerWorkspaceRecord[] = [];
  const errors: ConfigValidationError[] = [];

  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (
      !item ||
      typeof item !== "object" ||
      !item.config ||
      !item.blueprint ||
      !item.manualState
    ) {
      errors.push({
        path: `customers.${i}`,
        message: "Customer record is missing required config, blueprint, or manualState fields.",
      });
      continue;
    }

    const yamlCheck = parseNominalXConfigYaml(
      serializeNominalXConfigYaml(item.config),
    );
    if (!yamlCheck.ok) {
      for (const e of yamlCheck.errors) {
        errors.push({
          path: `customers.${i}.${e.path}`,
          message: e.message,
        });
      }
      continue;
    }

    const uniqueId = ensureUniqueCustomerSlug(item.id || item.config.account.id, runningIds);
    runningIds.push(uniqueId);

    imported.push({
      ...item,
      id: uniqueId,
      updatedAt: new Date().toISOString(),
      config: {
        ...item.config,
        account: {
          ...item.config.account,
          id: uniqueId,
        },
      },
      blueprint: {
        ...item.blueprint,
        slug: uniqueId,
      },
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, imported };
}

/**
 * Converts a CustomerWorkspaceRecord into the standard AccountPreset +
 * AccountMissionState pair consumed by the cockpit views, reusing every
 * deterministic readiness, journey, and deliverable component seamlessly.
 */
export function buildCustomerCockpitModel(record: CustomerWorkspaceRecord): {
  virtualPreset: AccountPreset;
  mission: AccountMissionState;
} {
  const referenceDate = todayIsoUtc();
  const evaluated = evaluateManualCustomerGates({
    config: record.config,
    blueprint: record.blueprint,
    manualState: record.manualState,
    referenceDate,
    evaluatedAt: record.updatedAt,
  });

  const configWithWaivers: NominalXConfig = {
    ...record.config,
    waivers: evaluated.effectiveWaivers,
  };

  const baseSample = ACCOUNT_PRESETS["meridian-fintech"];
  const virtualPreset: AccountPreset = {
    ...baseSample,
    id: "meridian-fintech",
    tagline:
      record.blueprint.input.dealScopeSummary.trim() ||
      `${record.config.account.tier ?? "Custom Launch"} · Target ${record.config.account.target_go_live}`,
    demoRole: "Customer Launch Workspace",
    referenceDate,
    config: configWithWaivers,
    patchDiffs: [],
    crewDrillScenarios: Object.values(evaluated.crewDrill.alarms).map(
      (a) => a.scenario,
    ),
  };

  const mission: AccountMissionState = {
    presetId: "meridian-fintech",
    customizations: {
      ...createEmptyCustomizations(),
      customStations: configWithWaivers.custom_stations ?? [],
      disabledVectors: configWithWaivers.chaos_overrides?.disabled_vectors ?? [],
      customVectors: configWithWaivers.custom_vectors ?? [],
      disabledAlarms: configWithWaivers.disabled_alarms ?? [],
      customAlarms: configWithWaivers.custom_alarms ?? [],
      yamlBaseConfig: configWithWaivers,
    },
    patchedStations: [],
    customWaivers: [],
    removedPresetWaiverStations: [],
    flightCheck: evaluated.flightCheck,
    flightCheckRunCount: 1,
    selectedStation: record.selectedStation,
    stagedVectorPatches: [],
    appliedVectorPatches: [],
    staticFire: evaluated.staticFire,
    crewDrill: evaluated.crewDrill,
    crewSummary: evaluated.crewSummary,
    signers: record.signers,
    dossierSigned: record.dossierSigned,
    wireLog: record.wireLog,
  };

  return { virtualPreset, mission };
}

/**
 * Interactive manual status update helpers for My Customers.
 * Enforces Hard Stop non-waivable governance via @nominalx/core's validateManualWaiver.
 */
export function setManualGate1Status(
  record: CustomerWorkspaceRecord,
  stationCode: StationCode,
  nextStatus: ManualGate1Status,
  waiverInput?: WaiverInput,
  nowIso: string = new Date().toISOString(),
):
  | { ok: true; record: CustomerWorkspaceRecord }
  | { ok: false; error: string } {
  const bpItem = record.blueprint.gate1Items.find((i) => i.id === stationCode);
  if (!bpItem) {
    return { ok: false, error: `Unknown Gate 1 check "${stationCode}".` };
  }

  const prevEntry = record.manualState.gate1[stationCode] ?? {
    status: "PENDING" as const,
    evidenceNote: "",
  };

  if (nextStatus === "WAIVED") {
    if (!waiverInput) {
      return {
        ok: false,
        error:
          "Operational Risk Waiver requires a named owner, reason, <= 30d expiry date, and rollback plan.",
      };
    }

    const existingWaivers: WaiverInput[] = [];
    for (const [code, entry] of Object.entries(record.manualState.gate1)) {
      if (
        code.toUpperCase() !== String(stationCode).toUpperCase() &&
        entry.status === "WAIVED" &&
        entry.waiver
      ) {
        existingWaivers.push(entry.waiver);
      }
    }

    const validation = validateManualWaiver({
      stationCode,
      stationLabel: bpItem.label,
      isHardStop: bpItem.isHardStop,
      waiver: waiverInput,
      existingActiveWaivers: existingWaivers,
      referenceDate: nowIso.slice(0, 10),
      customStations: record.config.custom_stations,
    });

    if (!validation.ok) {
      return { ok: false, error: validation.message };
    }

    const nextManual: ManualGateState = {
      ...record.manualState,
      gate1: {
        ...record.manualState.gate1,
        [stationCode]: {
          ...prevEntry,
          status: "WAIVED",
          waiver: validation.waiver,
          updatedAt: nowIso,
        },
      },
    };
    const log = createWireEntry(
      "GOVERNANCE",
      "SIGN",
      `/manual/gate1/${String(stationCode).toLowerCase()}/waiver`,
      200,
      5,
      `WAIVER ISSUED · ${bpItem.label} (owner ${validation.waiver.owner}, expires ${validation.waiver.expires_at})`,
      [validation.waiver.reason, `Rollback: ${validation.waiver.rollback_plan}`],
    );

    return {
      ok: true,
      record: {
        ...record,
        updatedAt: nowIso,
        manualState: nextManual,
        wireLog: [log, ...record.wireLog].slice(0, 60),
      },
    };
  }

  const nextManual: ManualGateState = {
    ...record.manualState,
    gate1: {
      ...record.manualState.gate1,
      [stationCode]: {
        status: nextStatus,
        evidenceNote: prevEntry.evidenceNote,
        updatedAt: nowIso,
        waiver: undefined,
      },
    },
  };

  const log = createWireEntry(
    "GATE 1",
    "PATCH",
    bpItem.endpoint,
    nextStatus === "PASS" ? 200 : nextStatus === "FAIL" ? 503 : 202,
    6,
    `MANUAL CHECK · ${bpItem.label} -> ${nextStatus}`,
    prevEntry.evidenceNote.trim() ? [`Evidence: ${prevEntry.evidenceNote.trim()}`] : [],
  );

  return {
    ok: true,
    record: {
      ...record,
      updatedAt: nowIso,
      manualState: nextManual,
      wireLog: [log, ...record.wireLog].slice(0, 60),
    },
  };
}

export function setManualGate1Evidence(
  record: CustomerWorkspaceRecord,
  stationCode: StationCode,
  evidenceNote: string,
  nowIso: string = new Date().toISOString(),
): CustomerWorkspaceRecord {
  const prevEntry = record.manualState.gate1[stationCode] ?? {
    status: "PENDING" as const,
    evidenceNote: "",
  };
  return {
    ...record,
    updatedAt: nowIso,
    manualState: {
      ...record.manualState,
      gate1: {
        ...record.manualState.gate1,
        [stationCode]: {
          ...prevEntry,
          evidenceNote,
          updatedAt: nowIso,
        },
      },
    },
  };
}

export function setManualGate2Status(
  record: CustomerWorkspaceRecord,
  vectorId: string,
  nextStatus: ManualGate2Status,
  nowIso: string = new Date().toISOString(),
): CustomerWorkspaceRecord {
  const bpItem = record.blueprint.gate2Items.find((i) => i.id === vectorId);
  const prevEntry = record.manualState.gate2[vectorId] ?? {
    status: "PENDING" as const,
    evidenceNote: "",
  };
  const log = createWireEntry(
    "GATE 2",
    "PATCH",
    record.config.environment.endpoints.webhook_ingress,
    nextStatus === "PASS" ? 200 : nextStatus === "FAIL" ? 500 : 202,
    8,
    `MANUAL FAULT TEST · ${bpItem?.label ?? vectorId} -> ${nextStatus}`,
    prevEntry.evidenceNote.trim() ? [`Evidence: ${prevEntry.evidenceNote.trim()}`] : [],
  );
  return {
    ...record,
    updatedAt: nowIso,
    manualState: {
      ...record.manualState,
      gate2: {
        ...record.manualState.gate2,
        [vectorId]: {
          ...prevEntry,
          status: nextStatus,
          updatedAt: nowIso,
        },
      },
    },
    wireLog: [log, ...record.wireLog].slice(0, 60),
  };
}

export function setManualGate2Evidence(
  record: CustomerWorkspaceRecord,
  vectorId: string,
  evidenceNote: string,
  nowIso: string = new Date().toISOString(),
): CustomerWorkspaceRecord {
  const prevEntry = record.manualState.gate2[vectorId] ?? {
    status: "PENDING" as const,
    evidenceNote: "",
  };
  return {
    ...record,
    updatedAt: nowIso,
    manualState: {
      ...record.manualState,
      gate2: {
        ...record.manualState.gate2,
        [vectorId]: {
          ...prevEntry,
          evidenceNote,
          updatedAt: nowIso,
        },
      },
    },
  };
}

export function setManualGate3Status(
  record: CustomerWorkspaceRecord,
  alarmId: string,
  nextStatus: ManualGate3Status,
  splitSeconds?: number,
  nowIso: string = new Date().toISOString(),
): CustomerWorkspaceRecord {
  const bpItem = record.blueprint.gate3Items.find((i) => i.id === alarmId);
  const prevEntry = record.manualState.gate3[alarmId] ?? {
    status: "PENDING" as const,
    evidenceNote: "",
  };
  const log = createWireEntry(
    "GATE 3",
    "PATCH",
    `/drill/${alarmId}/manual`,
    nextStatus === "PASS" ? 200 : nextStatus === "FAIL" ? 422 : 202,
    7,
    `MANUAL INCIDENT DRILL · ${bpItem?.title ?? alarmId} -> ${nextStatus}`,
    prevEntry.evidenceNote.trim() ? [`Evidence: ${prevEntry.evidenceNote.trim()}`] : [],
  );
  return {
    ...record,
    updatedAt: nowIso,
    manualState: {
      ...record.manualState,
      gate3: {
        ...record.manualState.gate3,
        [alarmId]: {
          ...prevEntry,
          status: nextStatus,
          splitSeconds: splitSeconds ?? prevEntry.splitSeconds,
          updatedAt: nowIso,
        },
      },
    },
    wireLog: [log, ...record.wireLog].slice(0, 60),
  };
}

export function setManualGate3Evidence(
  record: CustomerWorkspaceRecord,
  alarmId: string,
  evidenceNote: string,
  nowIso: string = new Date().toISOString(),
): CustomerWorkspaceRecord {
  const prevEntry = record.manualState.gate3[alarmId] ?? {
    status: "PENDING" as const,
    evidenceNote: "",
  };
  return {
    ...record,
    updatedAt: nowIso,
    manualState: {
      ...record.manualState,
      gate3: {
        ...record.manualState.gate3,
        [alarmId]: {
          ...prevEntry,
          evidenceNote,
          updatedAt: nowIso,
        },
      },
    },
  };
}
