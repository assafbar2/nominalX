import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_PRESETS,
  applyCrewRemediation,
  buildDossier,
  buildReport,
  buildSimulatedCustomStationTelemetry,
  createCrewDrillState,
  CUSTOM_ALARM_TEMPLATES,
  CUSTOM_PAYMENTS_EXAMPLE_CONFIG,
  CUSTOM_STATION_TEMPLATES,
  CUSTOM_VECTOR_TEMPLATES,
  evaluateFlightCheck,
  parseNominalXConfigYaml,
  renderDossier,
  renderReport,
  resolveActiveChaosVectors,
  resolveCrewDrillScenarios,
  serializeNominalXConfigYaml,
  simulateCompletedCrewDrillForPreset,
  simulateFlightCheckForPreset,
  simulateStaticFireForPreset,
  startCrewAlarm,
  summarizeCrewDrill,
  tickCrewAlarm,
  type ExecutiveReadinessReport,
  type NominalXConfig,
  type OperationalSprintDigest,
  type WaiverAgingRegisterReport,
} from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = path.resolve(__dirname, "../../../examples");

describe("@nominalx/core — customizable stations, vectors, alarms & YAML round-trip", () => {
  it("parses examples/custom-payments-api/nominalx.yaml and round-trips losslessly via serializeNominalXConfigYaml", async () => {
    const yamlPath = path.join(
      EXAMPLES_DIR,
      "custom-payments-api/nominalx.yaml",
    );
    const raw = await readFile(yamlPath, "utf8");
    const parsed = parseNominalXConfigYaml(raw);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.config.account.id).toBe("custom-payments-api");
    expect(parsed.config.custom_stations).toHaveLength(1);
    expect(parsed.config.custom_stations![0]!.code).toBe("PCI_TOKEN_VAULT");
    expect(parsed.config.custom_stations![0]!.hard_stop).toBe(true);
    expect(parsed.config.custom_vectors).toHaveLength(1);
    expect(parsed.config.custom_vectors![0]!.id).toBe(
      "malformed_idempotency_key",
    );
    expect(parsed.config.custom_alarms).toHaveLength(1);
    expect(parsed.config.custom_alarms![0]!.id).toBe(
      "webhook_dlq_backlog_spike",
    );

    const serialized = serializeNominalXConfigYaml(parsed.config);
    const reparsed = parseNominalXConfigYaml(serialized);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;

    expect(reparsed.config.custom_stations).toEqual(
      parsed.config.custom_stations,
    );
    expect(reparsed.config.custom_vectors).toEqual(parsed.config.custom_vectors);
    expect(reparsed.config.custom_alarms).toEqual(parsed.config.custom_alarms);
  });

  it("rejects waivers targeting a hard_stop: true custom station in BOTH YAML validation and Gate 1 evaluation", () => {
    const configWithIllegalWaiver: NominalXConfig = {
      ...CUSTOM_PAYMENTS_EXAMPLE_CONFIG,
      waivers: [
        {
          station: "PCI_TOKEN_VAULT",
          owner: "tobias.keller@apexpayments.example",
          reason: "Attempting temporary bypass of PCI HSM vault",
          expires_at: "2026-12-10",
          rollback_plan: "Re-enable HSM",
        },
      ],
    };

    const yaml = serializeNominalXConfigYaml(configWithIllegalWaiver);
    const strictParse = parseNominalXConfigYaml(yaml);
    expect(strictParse.ok).toBe(false);
    if (!strictParse.ok) {
      expect(strictParse.errors[0]!.path).toBe("waivers.0.station");
      expect(strictParse.errors[0]!.message).toContain("HARD STOP");
      expect(strictParse.errors[0]!.message).toContain("hard_stop: true");
    }

    // Even if passed directly into Gate 1 engine with passing telemetry, waiver is strictly rejected
    const preset = ACCOUNT_PRESETS["meridian-fintech"];
    const fc = evaluateFlightCheck(
      configWithIllegalWaiver,
      {
        ...preset.patchedObserved,
        customStations: {
          PCI_TOKEN_VAULT: buildSimulatedCustomStationTelemetry(
            CUSTOM_STATION_TEMPLATES[0]!,
            true,
          ),
        },
      },
      { referenceDate: "2026-11-20" },
    );

    expect(fc.verdict).toBe("NO_GO");
    expect(fc.exitCode).toBe(1);
    expect(fc.waiverAudit.hardStopViolations).toHaveLength(1);
    expect(fc.waiverAudit.hardStopViolations[0]!.violationCode).toBe(
      "HARD_STOP_WAIVER_FORBIDDEN",
    );
    const pciStation = fc.stations.find(
      (s) => s.stationCode === "PCI_TOKEN_VAULT",
    );
    expect(pciStation?.status).toBe("NO_GO");
    expect(pciStation?.isHardStop).toBe(true);
    expect(pciStation?.subStage).toBe("7 of 7");
  });

  it("allows operational waivers on hard_stop: false custom stations while locking hard_stop: true stations", () => {
    const customConfig: NominalXConfig = {
      ...ACCOUNT_PRESETS["meridian-fintech"].config,
      waivers: [
        {
          station: "PARTNER_SLA_GATEWAY",
          owner: "maya.chen@meridian.example",
          reason: "Partner SLA header rolls out next Tuesday",
          expires_at: "2026-12-10",
          rollback_plan: "Route via primary edge pool",
          issued_at: "2026-11-20",
        },
      ],
      custom_stations: [
        CUSTOM_STATION_TEMPLATES[0]!, // PCI_TOKEN_VAULT (hard_stop: true)
        CUSTOM_STATION_TEMPLATES[1]!, // PARTNER_SLA_GATEWAY (hard_stop: false)
      ],
    };

    const parsed = parseNominalXConfigYaml(
      serializeNominalXConfigYaml(customConfig),
    );
    expect(parsed.ok).toBe(true);

    const fc = simulateFlightCheckForPreset("meridian-fintech", {
      overrideConfig: customConfig,
      patchedStations: [
        "RESIDENCY",
        "WEBHOOKS",
        "ROLLBACK",
        "PCI_TOKEN_VAULT",
      ],
    });

    expect(fc.counts.total).toBe(8);
    expect(fc.stations[0]!.subStage).toBe("1 of 8");
    expect(fc.stations[6]!.subStage).toBe("7 of 8");
    expect(fc.stations[7]!.subStage).toBe("8 of 8");
    expect(fc.verdict).toBe("CONDITIONAL_GO");
    expect(fc.counts.hardStopFailures).toBe(0);
    expect(fc.counts.heldWaived).toBe(1);
    expect(
      fc.stations.find((s) => s.stationCode === "PARTNER_SLA_GATEWAY")?.status,
    ).toBe("HOLD_WAIVED");
  });

  it("dynamically numbers, grades, and patches enabled built-in + custom Gate 2 vectors", () => {
    const customConfig: NominalXConfig = {
      ...ACCOUNT_PRESETS["meridian-fintech"].config,
      chaos_overrides: {
        disabled_vectors: ["additive_json_fields", "clock_skew_5m"],
      },
      custom_vectors: [CUSTOM_VECTOR_TEMPLATES[0]!],
    };

    const resolved = resolveActiveChaosVectors(customConfig);
    expect(resolved).toHaveLength(6); // 7 - 2 + 1
    expect(resolved.map((v) => v.subStage)).toEqual([
      "1 of 6",
      "2 of 6",
      "3 of 6",
      "4 of 6",
      "5 of 6",
      "6 of 6",
    ]);
    expect(resolved[5]!.vectorId).toBe("malformed_idempotency_key");
    expect(resolved[5]!.isCustom).toBe(true);

    const fire1 = simulateStaticFireForPreset("meridian-fintech", {
      overrideConfig: customConfig,
      patchedVectors: [],
    });
    expect(fire1.totals.totalVectors).toBe(6);
    expect(fire1.passed).toBe(false);
    expect(
      fire1.vectors.find((v) => v.vectorId === "malformed_idempotency_key")
        ?.passed,
    ).toBe(false);

    const fire2 = simulateStaticFireForPreset("meridian-fintech", {
      overrideConfig: customConfig,
      patchedVectors: [
        "duplicate_webhook",
        "out_of_order",
        "dual_hmac_rotation",
        "malformed_idempotency_key",
      ],
      previousAttempts: fire1.attemptHistory,
    });
    expect(fire2.passed).toBe(true);
    expect(fire2.grade).toBe("A");
    expect(fire2.corruptionPct).toBe(0);
    expect(fire2.totals.passedVectors).toBe(6);
    expect(fire2.totals.totalVectors).toBe(6);
  });

  it("runs custom Gate 3 alarms with dynamic numbering and flows custom gates cleanly into Dossier and Reports", () => {
    const customConfig: NominalXConfig = {
      ...CUSTOM_PAYMENTS_EXAMPLE_CONFIG,
      disabled_alarms: ["dead_p1_alert_channel"],
    };

    const preset = ACCOUNT_PRESETS["meridian-fintech"];
    const scenarios = resolveCrewDrillScenarios(
      preset.crewDrillScenarios,
      customConfig,
    );
    expect(scenarios).toHaveLength(3); // 3 - 1 + 1
    expect(scenarios.map((s) => s.subStage)).toEqual([
      "1 of 3",
      "2 of 3",
      "3 of 3",
    ]);
    expect(scenarios[2]!.alarmId).toBe("webhook_dlq_backlog_spike");
    expect(scenarios[2]!.isCustom).toBe(true);

    let drill = createCrewDrillState({
      accountId: customConfig.account.id,
      accountName: customConfig.account.name,
      accountableOwner: customConfig.account.cse_owner,
      scenarios,
    });
    drill = startCrewAlarm(drill, "webhook_dlq_backlog_spike");
    drill = tickCrewAlarm(drill, "webhook_dlq_backlog_spike", 15);
    expect(drill.alarms.webhook_dlq_backlog_spike!.remainingSeconds).toBe(75);

    const badCustom = applyCrewRemediation(
      drill,
      "webhook_dlq_backlog_spike",
      { custom_remediation_applied: false, verification_probe_confirmed: false },
      20,
    );
    expect(badCustom.accepted).toBe(false);

    const okCustom = applyCrewRemediation(
      badCustom.state,
      "webhook_dlq_backlog_spike",
      { custom_remediation_applied: true, verification_probe_confirmed: true },
      24.5,
    );
    expect(okCustom.accepted).toBe(true);
    expect(
      okCustom.state.alarms.webhook_dlq_backlog_spike!.verificationProof,
    ).toContain("DLQ backlog drained");

    // Full Dossier + Reports check with all customizations active
    const g1 = simulateFlightCheckForPreset("meridian-fintech", {
      overrideConfig: customConfig,
      patchedStations: ["RESIDENCY", "WEBHOOKS", "PCI_TOKEN_VAULT"],
    });
    const g2 = simulateStaticFireForPreset("meridian-fintech", {
      overrideConfig: customConfig,
      patchedVectors: [
        "duplicate_webhook",
        "out_of_order",
        "dual_hmac_rotation",
        "malformed_idempotency_key",
      ],
    });
    const g3 = simulateCompletedCrewDrillForPreset(
      "meridian-fintech",
      "2026-11-20T16:30:00.000Z",
      customConfig,
    );

    const dossier = buildDossier({
      config: customConfig,
      gate1: g1,
      gate2: g2,
      gate3: g3,
      generatedAt: "2026-11-20T17:00:00.000Z",
    });

    expect(dossier.scopeSummary.hardStopsEnforced).toContain(
      "PCI / Secret Vault",
    );
    expect(dossier.runbook.sections.some((s) => s.id === "custom-station-probes")).toBe(true);
    expect(dossier.runbook.sections.some((s) => s.id === "custom-day30-alarms")).toBe(true);

    const dossierMd = renderDossier(dossier, "md");
    expect(dossierMd).toContain("PCI / Secret Vault");
    expect(dossierMd).toContain("Malformed Idempotency Key");
    expect(dossierMd).toContain("Webhook DLQ Backlog Spike");
    expect(dossierMd).toContain("8/8");

    const exec = buildReport("exec", {
      config: customConfig,
      gate1: g1,
      gate2: g2,
      gate3: g3,
      dossierSigned: true,
    }) as ExecutiveReadinessReport;
    expect(exec.hardStopCompliance.allHardStops).toHaveLength(3);
    expect(exec.gate1Summary.totalStations).toBe(7);
    expect(exec.gate2Summary.totalVectors).toBe(8);
    expect(renderReport(exec, "md")).toContain("PCI / Secret Vault");

    const ops = buildReport("ops", {
      config: customConfig,
      gate1: g1,
      gate2: g2,
      gate3: g3,
    }) as OperationalSprintDigest;
    expect(
      ops.integrationMatrix.some((row) =>
        row.integration.includes("PCI / Secret Vault"),
      ),
    ).toBe(true);

    const waivers = buildReport("waivers", {
      config: customConfig,
      gate1: g1,
    }) as WaiverAgingRegisterReport;
    expect(
      waivers.policyAttestation.hardStopStations.some((s) =>
        s.includes("PCI / Secret Vault"),
      ),
    ).toBe(true);
  });

  it("rejects colliding/duplicate custom IDs and disabling all vectors or alarms", () => {
    const dupStationYaml = serializeNominalXConfigYaml({
      ...ACCOUNT_PRESETS["meridian-fintech"].config,
      custom_stations: [
        { ...CUSTOM_STATION_TEMPLATES[0]!, code: "AUTH_SSO" },
      ],
    });
    const r1 = parseNominalXConfigYaml(dupStationYaml);
    expect(r1.ok).toBe(false);

    const noVectorsYaml = serializeNominalXConfigYaml({
      ...ACCOUNT_PRESETS["meridian-fintech"].config,
      chaos_overrides: {
        disabled_vectors: [
          "duplicate_webhook",
          "out_of_order",
          "rate_limit_429",
          "upstream_timeout_30s",
          "dual_hmac_rotation",
          "additive_json_fields",
          "clock_skew_5m",
        ],
      },
    });
    const r2 = parseNominalXConfigYaml(noVectorsYaml);
    expect(r2.ok).toBe(false);

    const noAlarmsYaml = serializeNominalXConfigYaml({
      ...ACCOUNT_PRESETS["meridian-fintech"].config,
      disabled_alarms: [
        "runaway_ingestion_storm",
        "sso_cert_expiring_24h",
        "dead_p1_alert_channel",
      ],
    });
    const r3 = parseNominalXConfigYaml(noAlarmsYaml);
    expect(r3.ok).toBe(false);
    expect(CUSTOM_ALARM_TEMPLATES).toHaveLength(1);
  });
});
