import { describe, expect, it } from "vitest";
import {
  ACCOUNT_PRESETS,
  applyCrewRemediation,
  CUSTOM_ALARM_TEMPLATES,
  CUSTOM_PAYMENTS_EXAMPLE_CONFIG,
  CUSTOM_STATION_TEMPLATES,
  CUSTOM_VECTOR_TEMPLATES,
  serializeNominalXConfigYaml,
  startCrewAlarm,
  summarizeCrewDrill,
} from "@nominalx/core";
import {
  applyCustomizationsToMission,
  applyYamlToMission,
  clearStoredCustomizations,
  computeMissionJourney,
  computeReadinessScore,
  countActiveCustomizations,
  createEmptyCustomizations,
  createInitialMissionState,
  evaluateMissionStaticFire,
  evaluatePresetFlightCheck,
  getEffectiveConfigForMission,
  loadStoredCustomizations,
  saveStoredCustomizations,
  serializeMissionToYaml,
} from "./missionState";

describe("web missionState engine integration", () => {
  it("initializes all 4 enterprise presets with deterministic Gate 1 & Gate 2 state", () => {
    const meridian = createInitialMissionState("meridian-fintech");
    expect(meridian.flightCheck.verdict).toBe("NO_GO");
    expect(meridian.flightCheck.counts.hardStopFailures).toBe(1);
    expect(meridian.staticFire.corruptionPct).toBe(34.2);
    expect(meridian.staticFire.grade).toBe("F");

    const kestrel = createInitialMissionState("kestrel-health");
    expect(kestrel.flightCheck.counts.hardStopFailures).toBe(1);
    expect(kestrel.staticFire.corruptionPct).toBe(41.0);

    const vanguard = createInitialMissionState("vanguard-retail");
    expect(vanguard.staticFire.corruptionPct).toBe(14.8);
    expect(vanguard.staticFire.grade).toBe("D");

    const helios = createInitialMissionState("helios-logistics");
    expect(helios.flightCheck.verdict).toBe("CONDITIONAL_GO");
    expect(helios.staticFire.corruptionPct).toBe(1.0);
    expect(helios.staticFire.grade).toBe("B");
  });

  it("caps readiness score while a Hard Stop station is failing and unlocks once patched", () => {
    const initial = createInitialMissionState("meridian-fintech");
    expect(computeReadinessScore(initial)).toBeLessThanOrEqual(65);

    const preset = ACCOUNT_PRESETS["meridian-fintech"];
    const patchedFc = evaluatePresetFlightCheck(
      preset,
      ["RESIDENCY", "WEBHOOKS"],
      [],
      [],
    );
    expect(patchedFc.verdict).toBe("CONDITIONAL_GO");
    expect(patchedFc.counts.hardStopFailures).toBe(0);

    const journey = computeMissionJourney({
      ...initial,
      flightCheck: patchedFc,
    });
    expect(journey.hardStopStatus).toBe("CLEAR");
    expect(journey.activeGate).toBe(2);
  });

  it("enforces Hard Stop lock on a custom hard_stop: true station and rejects YAML waivers targeting it", () => {
    const preset = ACCOUNT_PRESETS["helios-logistics"];
    const base = createInitialMissionState("helios-logistics", {
      skipStorage: true,
    });
    expect(base.flightCheck.verdict).toBe("CONDITIONAL_GO");
    expect(base.flightCheck.counts.hardStopFailures).toBe(0);

    const withPci = applyCustomizationsToMission(preset, base, {
      ...createEmptyCustomizations(),
      customStations: [CUSTOM_STATION_TEMPLATES[0]!],
    });
    expect(withPci.flightCheck.counts.total).toBe(7);
    expect(withPci.flightCheck.counts.hardStopFailures).toBe(1);
    expect(withPci.flightCheck.verdict).toBe("NO_GO");
    expect(computeReadinessScore(withPci)).toBeLessThanOrEqual(65);

    // Attempt to waive PCI_TOKEN_VAULT in YAML -> must fail validation
    const illegalYaml = serializeMissionToYaml(preset, withPci).replace(
      "station: ROLLBACK",
      "station: PCI_TOKEN_VAULT",
    );
    const rejected = applyYamlToMission(preset, withPci, illegalYaml);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.errors.some((e) => e.message.includes("HARD STOP"))).toBe(
        true,
      );
    }

    // Patching PCI_TOKEN_VAULT clears the Hard Stop lock
    const patchedFc = evaluatePresetFlightCheck(
      preset,
      ["PCI_TOKEN_VAULT"],
      [],
      [],
      withPci.customizations,
    );
    expect(patchedFc.counts.hardStopFailures).toBe(0);
    expect(patchedFc.verdict).toBe("CONDITIONAL_GO");
  });

  it("wires custom chaos vectors to patch-to-zero Grade A in Gate 2", () => {
    const preset = ACCOUNT_PRESETS["helios-logistics"];
    const base = createInitialMissionState("helios-logistics", {
      skipStorage: true,
    });

    const customized = applyCustomizationsToMission(preset, base, {
      ...createEmptyCustomizations(),
      customVectors: [CUSTOM_VECTOR_TEMPLATES[0]!],
    });

    expect(customized.staticFire.totals.totalVectors).toBe(8);
    expect(customized.staticFire.passed).toBe(false);
    expect(
      customized.staticFire.vectors.find(
        (v) => v.vectorId === "malformed_idempotency_key",
      )?.passed,
    ).toBe(false);

    const effective = getEffectiveConfigForMission(preset, customized);
    const refired = evaluateMissionStaticFire(preset, effective, {
      patchedVectors: ["dual_hmac_rotation", "malformed_idempotency_key"],
      attemptNumber: 2,
      previousAttempts: customized.staticFire.attemptHistory,
    });
    expect(refired.passed).toBe(true);
    expect(refired.grade).toBe("A");
    expect(refired.corruptionPct).toBe(0);
    expect(refired.totals.passedVectors).toBe(8);
    expect(refired.totals.totalVectors).toBe(8);
  });

  it("plays and stabilizes a custom Day-30 alarm in Gate 3 and round-trips full YAML cleanly", () => {
    const preset = ACCOUNT_PRESETS["meridian-fintech"];
    const base = createInitialMissionState("meridian-fintech", {
      skipStorage: true,
    });

    const paymentsYaml = serializeNominalXConfigYaml(
      CUSTOM_PAYMENTS_EXAMPLE_CONFIG,
    );
    const applied = applyYamlToMission(preset, base, paymentsYaml);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const state = applied.state;
    expect(state.flightCheck.counts.total).toBe(7);
    expect(state.staticFire.totals.totalVectors).toBe(8);
    expect(state.crewSummary.totalAlarms).toBe(4);
    expect(state.crewDrill.alarmOrder).toContain(CUSTOM_ALARM_TEMPLATES[0]!.id);

    let drill = startCrewAlarm(state.crewDrill, "webhook_dlq_backlog_spike");
    const fix = applyCrewRemediation(
      drill,
      "webhook_dlq_backlog_spike",
      { custom_remediation_applied: true, verification_probe_confirmed: true },
      18.5,
    );
    expect(fix.accepted).toBe(true);
    drill = fix.state;
    const summary = summarizeCrewDrill(drill);
    expect(summary.stabilizedCount).toBe(1);
    expect(summary.totalAlarms).toBe(4);

    // YAML round-trip preserves all customizations
    const roundTripped = serializeMissionToYaml(preset, state);
    const reapplied = applyYamlToMission(preset, state, roundTripped);
    expect(reapplied.ok).toBe(true);
    if (reapplied.ok) {
      expect(reapplied.config.custom_stations).toHaveLength(1);
      expect(reapplied.config.custom_vectors).toHaveLength(1);
      expect(reapplied.config.custom_alarms).toHaveLength(1);
    }
  });

  it("clears stored customizations for the active account without affecting other accounts on Reset Scenario", () => {
    const store = new Map<string, string>();
    const prevWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window: unknown }).window = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    };

    try {
      const meridianCustom = {
        ...createEmptyCustomizations(),
        customStations: [CUSTOM_STATION_TEMPLATES[0]!],
      };
      const heliosCustom = {
        ...createEmptyCustomizations(),
        customVectors: [CUSTOM_VECTOR_TEMPLATES[0]!],
      };

      saveStoredCustomizations("meridian-fintech", meridianCustom);
      saveStoredCustomizations("helios-logistics", heliosCustom);
      expect(
        countActiveCustomizations(loadStoredCustomizations("meridian-fintech")),
      ).toBe(1);
      expect(
        countActiveCustomizations(loadStoredCustomizations("helios-logistics")),
      ).toBe(1);

      // Mirrors App.handleResetScenario for meridian-fintech
      clearStoredCustomizations("meridian-fintech");
      const resetState = createInitialMissionState("meridian-fintech", {
        skipStorage: true,
      });

      expect(countActiveCustomizations(resetState.customizations)).toBe(0);
      expect(resetState.flightCheck.counts.total).toBe(6);
      expect(
        countActiveCustomizations(loadStoredCustomizations("meridian-fintech")),
      ).toBe(0);
      // Other account remains untouched
      expect(
        countActiveCustomizations(loadStoredCustomizations("helios-logistics")),
      ).toBe(1);
    } finally {
      if (prevWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window: unknown }).window = prevWindow;
      }
    }
  });
});
