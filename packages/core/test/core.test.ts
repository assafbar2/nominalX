import { createHash, createHmac } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_PRESETS,
  applyCrewRemediation,
  buildDossier,
  buildReport,
  calculateResilienceGrade,
  canonicalJsonStringify,
  computeJourneyState,
  computeVerificationDigest,
  createCrewDrillState,
  evaluateFlightCheck,
  evaluateWaivers,
  GATE1_SUB_STAGES,
  GATE2_SUB_STAGES,
  GATE3_SUB_STAGES,
  HANDOVER_SPRINT_METADATA,
  hmacSha256Hex,
  LIFECYCLE_STAGES,
  listAccountPresets,
  parseNominalXYaml,
  renderDossier,
  renderReport,
  sha256Hex,
  simulateCompletedCrewDrillForPreset,
  simulateFlightCheckForPreset,
  simulateStaticFireForPreset,
  startCrewAlarm,
  summarizeCrewDrill,
  tickCrewAlarm,
} from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_SRC_DIR = path.resolve(__dirname, "../src");
const EXAMPLES_DIR = path.resolve(__dirname, "../../../examples");

describe("@nominalx/core — browser safety & crypto determinism", () => {
  it("contains zero Node-only imports or Node globals inside packages/core/src", async () => {
    const files = await readdir(CORE_SRC_DIR);
    const tsFiles = files.filter((f) => f.endsWith(".ts"));
    expect(tsFiles.length).toBeGreaterThanOrEqual(8);

    const forbiddenPatterns = [
      /from\s+["']node:/,
      /from\s+["'](fs|path|http|https|crypto|os|url|child_process)["']/,
      /\bprocess\./,
      /\bBuffer\./,
    ];

    for (const file of tsFiles) {
      const content = await readFile(path.join(CORE_SRC_DIR, file), "utf8");
      for (const pattern of forbiddenPatterns) {
        expect(
          pattern.test(content),
          `Found Node-only reference ${pattern} in packages/core/src/${file}`,
        ).toBe(false);
      }
    }
  });

  it("matches native Node SHA-256 and HMAC-SHA256 byte-for-byte", () => {
    const samples = [
      "",
      "abc",
      "NominalX — Sales says green. Nothing is nominal until telemetry proves it.",
      "unicode-rocket-🚀-eu-central-1",
      "a".repeat(256),
    ];

    for (const sample of samples) {
      const expectedSha = createHash("sha256").update(sample, "utf8").digest("hex");
      expect(sha256Hex(sample)).toBe(expectedSha);

      const secret = "whsec_test_key_with_sufficient_entropy_1234567890";
      const expectedHmac = createHmac("sha256", secret)
        .update(sample, "utf8")
        .digest("hex");
      expect(hmacSha256Hex(secret, sample)).toBe(expectedHmac);

      const longSecret = "k".repeat(128);
      const expectedLongHmac = createHmac("sha256", longSecret)
        .update(sample, "utf8")
        .digest("hex");
      expect(hmacSha256Hex(longSecret, sample)).toBe(expectedLongHmac);
    }
  });

  it("produces identical verification digests regardless of object key order", () => {
    const a = { z: 1, a: { c: true, b: [3, 2, 1] } };
    const b = { a: { b: [3, 2, 1], c: true }, z: 1 };
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
    expect(computeVerificationDigest(a)).toBe(computeVerificationDigest(b));
    expect(computeVerificationDigest(a)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("@nominalx/core — schema validation & examples/", () => {
  it("parses and validates all 4 enterprise YAML fixtures in examples/", async () => {
    const fixtureDirs = [
      "meridian-fintech",
      "kestrel-health",
      "vanguard-retail",
      "helios-logistics",
    ];

    for (const dir of fixtureDirs) {
      const yamlPath = path.join(EXAMPLES_DIR, dir, "nominalx.yaml");
      const text = await readFile(yamlPath, "utf8");
      const parsed = parseNominalXYaml(text);
      expect(parsed.ok, `Fixture ${dir}/nominalx.yaml failed validation`).toBe(true);
      if (parsed.ok) {
        expect(parsed.config.account.id).toBe(dir);
        expect(parsed.config.schema_version).toBe("1.0");
      }
    }
  });

  it("fails fast with plain operational errors on invalid configs", () => {
    const res = parseNominalXYaml(`
schema_version: "1.0"
account:
  id: "Bad ID"
`);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.length).toBeGreaterThan(0);
    }
  });
});

describe("@nominalx/core — Unified Gate 1-3, unnumbered bookends & sub-stage metadata catalog", () => {
  it("keeps Deal Close, Support, and Renewal & Expansion unnumbered and Gate 1-3 as the only numbered readiness stages", () => {
    expect(LIFECYCLE_STAGES).toHaveLength(6);
    expect(LIFECYCLE_STAGES[0]!.displayTitle).toBe("Deal Close");
    expect(LIFECYCLE_STAGES[1]!.displayTitle).toBe("Gate 1: Flight Check · Setup Check");
    expect(LIFECYCLE_STAGES[1]!.gateLabel).toBe("Gate 1: Flight Check · Setup Check");
    expect(LIFECYCLE_STAGES[2]!.displayTitle).toBe("Gate 2: Static Fire · Fault Injection");
    expect(LIFECYCLE_STAGES[2]!.gateLabel).toBe("Gate 2: Static Fire · Fault Injection");
    expect(LIFECYCLE_STAGES[3]!.displayTitle).toBe("Gate 3: Crew Drill · Live Incident Drill");
    expect(LIFECYCLE_STAGES[4]!.displayTitle).toBe("Support");
    expect(LIFECYCLE_STAGES[5]!.displayTitle).toBe("Renewal & Expansion");

    for (const stage of LIFECYCLE_STAGES) {
      expect(stage.singleAccountableOwner.length).toBeGreaterThan(3);
      expect(stage.vendorEngineers.length).toBeGreaterThan(0);
      expect(stage.customerEngineers.length).toBeGreaterThan(0);
      expect(stage.integrations.length).toBeGreaterThan(0);
      expect(stage.inScope.length).toBeGreaterThan(0);
      expect(stage.outOfScope.length).toBeGreaterThan(0);
      expect(stage.definitionOfDone.length).toBeGreaterThan(0);
      expect(stage.timeBox.length).toBeGreaterThan(0);
      expect(stage.trigger.length).toBeGreaterThan(0);
    }

    expect(GATE1_SUB_STAGES.map((s) => s.subStageLabel)).toEqual([
      "1 of 6",
      "2 of 6",
      "3 of 6",
      "4 of 6",
      "5 of 6",
      "6 of 6",
    ]);
    expect(GATE2_SUB_STAGES.map((s) => s.subStageLabel)).toEqual([
      "1 of 7",
      "2 of 7",
      "3 of 7",
      "4 of 7",
      "5 of 7",
      "6 of 7",
      "7 of 7",
    ]);
    expect(GATE3_SUB_STAGES.map((s) => s.subStageLabel)).toEqual([
      "1 of 3",
      "2 of 3",
      "3 of 3",
    ]);
    expect(HANDOVER_SPRINT_METADATA.coSigners.length).toBe(2);
  });
});

describe("@nominalx/core — Gate 1 (Flight Check), Hard Stops & Waiver Governance", () => {
  it("strictly rejects any waiver targeting AUTH / SSO or RESIDENCY as non-waivable NO-GO", () => {
    const preset = ACCOUNT_PRESETS["meridian-fintech"];
    const result = evaluateFlightCheck(preset.config, preset.patchedObserved, {
      referenceDate: "2026-11-20",
      extraWaivers: [
        {
          station: "AUTH / SSO",
          owner: "tobias.keller@meridian.example",
          reason: "Attempted temporary SSO bypass",
          expires_at: "2026-12-01",
          rollback_plan: "Re-enable SAML",
        },
        {
          station: "RESIDENCY",
          owner: "maya.chen@meridian.example",
          reason: "Attempted temporary us-east-1 routing",
          expires_at: "2026-12-01",
          rollback_plan: "Pin eu-central-1",
        },
      ],
    });

    expect(result.verdict).toBe("NO_GO");
    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.waiverAudit.hardStopViolations).toHaveLength(2);
    expect(
      result.waiverAudit.hardStopViolations.every(
        (v) => v.violationCode === "HARD_STOP_WAIVER_FORBIDDEN",
      ),
    ).toBe(true);
    expect(result.stations[0]!.status).toBe("NO_GO");
    expect(result.stations[1]!.status).toBe("NO_GO");
  });

  it("enforces max 2 active operational waivers, <= 30d expiry, and expired drift detection", () => {
    const audit = evaluateWaivers(
      [
        {
          station: "WEBHOOKS",
          owner: "eng1@example.com",
          reason: "Dual key rollout in progress",
          expires_at: "2026-11-25",
          rollback_plan: "Disable webhook ingress",
        },
        {
          station: "ROLLBACK",
          owner: "eng2@example.com",
          reason: "Manual failover active",
          expires_at: "2026-12-02",
          rollback_plan: "Run failover script",
        },
        {
          station: "QUOTA / RATE",
          owner: "eng3@example.com",
          reason: "3rd waiver should breach cap of 2",
          expires_at: "2026-12-10",
          rollback_plan: "Throttle non-critical traffic",
        },
        {
          station: "ALERTING",
          owner: "eng4@example.com",
          reason: "Exceeds 30 days",
          expires_at: "2027-01-15",
          rollback_plan: "PagerDuty backup",
        },
      ],
      "2026-11-20",
    );

    expect(audit.activeWaivers).toHaveLength(2);
    expect(audit.activeWaivers[0]!.daysRemaining).toBe(5);
    expect(audit.activeWaivers[0]!.agingBand).toBe("CRITICAL_7D");
    expect(audit.activeWaivers[1]!.daysRemaining).toBe(12);
    expect(audit.activeWaivers[1]!.agingBand).toBe("WARNING_14D");

    const limitErr = audit.rejectedWaivers.find(
      (w) => w.stationCode === "QUOTA_RATE",
    );
    expect(limitErr?.violationCode).toBe("WAIVER_LIMIT_EXCEEDED");

    const durationErr = audit.rejectedWaivers.find(
      (w) => w.stationCode === "ALERTING",
    );
    expect(durationErr?.violationCode).toBe("WAIVER_EXCEEDS_30_DAYS");

    // Expired waiver detection (live Support drift detector)
    const expiredAudit = evaluateWaivers(
      [
        {
          station: "ROLLBACK",
          owner: "maya.chen@meridian.example",
          reason: "Expired waiver",
          expires_at: "2026-12-15",
          rollback_plan: "Manual failover",
        },
      ],
      "2026-12-20",
    );
    expect(expiredAudit.activeWaivers).toHaveLength(0);
    expect(expiredAudit.rejectedWaivers[0]!.violationCode).toBe("WAIVER_EXPIRED");
    expect(expiredAudit.rejectedWaivers[0]!.agingBand).toBe("EXPIRED");
  });

  it("evaluates all 4 enterprise presets accurately before and after patching", () => {
    expect(listAccountPresets()).toHaveLength(4);

    // Meridian: NO_GO initially -> CONDITIONAL_GO after residency+webhooks -> NOMINAL after rollback
    const mInitial = simulateFlightCheckForPreset("meridian-fintech");
    expect(mInitial.verdict).toBe("NO_GO");
    expect(mInitial.counts.noGo).toBe(2);
    expect(mInitial.counts.heldWaived).toBe(1);

    const mPatched = simulateFlightCheckForPreset("meridian-fintech", {
      patchedStations: ["RESIDENCY", "WEBHOOKS"],
    });
    expect(mPatched.verdict).toBe("CONDITIONAL_GO");
    expect(mPatched.counts.nominal).toBe(5);
    expect(mPatched.counts.heldWaived).toBe(1);

    const mFull = simulateFlightCheckForPreset("meridian-fintech", {
      patchedStations: ["RESIDENCY", "WEBHOOKS", "ROLLBACK"],
    });
    expect(mFull.verdict).toBe("NOMINAL");
    expect(mFull.counts.nominal).toBe(6);

    // Kestrel: Hard Stop AUTH_SSO + ALERTING fail initially
    const kInitial = simulateFlightCheckForPreset("kestrel-health");
    expect(kInitial.verdict).toBe("NO_GO");
    expect(kInitial.counts.hardStopFailures).toBe(1);

    // Vanguard: WEBHOOKS + QUOTA_RATE fail initially
    const vInitial = simulateFlightCheckForPreset("vanguard-retail");
    expect(vInitial.verdict).toBe("NO_GO");
    expect(vInitial.counts.noGo).toBe(2);

    // Helios: Near-launch (5/6 NOMINAL + 1 HOLD_WAIVED => CONDITIONAL_GO out of the box)
    const hInitial = simulateFlightCheckForPreset("helios-logistics");
    expect(hInitial.verdict).toBe("CONDITIONAL_GO");
    expect(hInitial.counts.nominal).toBe(5);
    expect(hInitial.counts.heldWaived).toBe(1);
  });
});

describe("@nominalx/core — Gate 2 (Static Fire) 7-vector grading & history", () => {
  it("matches exact corruption percentages and A-F resilience grades for all 4 accounts", () => {
    expect(calculateResilienceGrade(0, true)).toBe("A");
    expect(calculateResilienceGrade(1.0, false)).toBe("B");
    expect(calculateResilienceGrade(5.0, false)).toBe("C");
    expect(calculateResilienceGrade(14.8, false)).toBe("D");
    expect(calculateResilienceGrade(34.2, false)).toBe("F");

    const m1 = simulateStaticFireForPreset("meridian-fintech");
    expect(m1.corruptionPct).toBe(34.2);
    expect(m1.grade).toBe("F");
    expect(m1.passed).toBe(false);
    expect(m1.telemetrySeries).toHaveLength(24);

    const m2 = simulateStaticFireForPreset("meridian-fintech", {
      patchedVectors: ["duplicate_webhook", "out_of_order", "dual_hmac_rotation"],
      previousAttempts: m1.attemptHistory,
    });
    expect(m2.corruptionPct).toBe(0);
    expect(m2.grade).toBe("A");
    expect(m2.passed).toBe(true);
    expect(m2.attemptHistory).toHaveLength(2);
    expect(m2.attemptHistory[0]!.grade).toBe("F");
    expect(m2.attemptHistory[1]!.grade).toBe("A");

    expect(simulateStaticFireForPreset("kestrel-health").corruptionPct).toBe(41.0);
    expect(simulateStaticFireForPreset("vanguard-retail").corruptionPct).toBe(14.8);
    expect(simulateStaticFireForPreset("vanguard-retail").grade).toBe("D");
    expect(simulateStaticFireForPreset("helios-logistics").corruptionPct).toBe(1.0);
    expect(simulateStaticFireForPreset("helios-logistics").grade).toBe("B");
  });
});

describe("@nominalx/core — Gate 3 (Crew Drill) 3-alarm ops state machine", () => {
  it("rejects incomplete fixes, tracks OVERTIME > 90s, and locks 3/3 stabilization", () => {
    const preset = ACCOUNT_PRESETS["meridian-fintech"];
    let state = createCrewDrillState({
      accountId: preset.config.account.id,
      accountName: preset.config.account.name,
      accountableOwner: preset.config.account.cse_owner,
      scenarios: preset.crewDrillScenarios,
    });

    // Start Alarm 1 and test wrong remediation
    state = startCrewAlarm(state, "runaway_ingestion_storm", "2026-11-20T16:30:00.000Z");
    state = tickCrewAlarm(state, "runaway_ingestion_storm", 45);
    expect(state.alarms.runaway_ingestion_storm.remainingSeconds).toBe(45);
    expect(state.alarms.runaway_ingestion_storm.overtime).toBe(false);

    const badAttempt = applyCrewRemediation(
      state,
      "runaway_ingestion_storm",
      { isolated_source_key: "wrong_source", rate_cap_rps: 99999, dlq_overflow_enabled: false },
      52,
    );
    expect(badAttempt.accepted).toBe(false);
    expect(badAttempt.message).toContain("BURN_RATE_ABOVE_SLA");

    // Cross 90s into OVERTIME, then apply valid fix
    state = tickCrewAlarm(badAttempt.state, "runaway_ingestion_storm", 95);
    expect(state.alarms.runaway_ingestion_storm.status).toBe("overtime");
    expect(state.alarms.runaway_ingestion_storm.overtime).toBe(true);

    const good1 = applyCrewRemediation(
      state,
      "runaway_ingestion_storm",
      preset.crewDrillScenarios[0]!.expectedRemediation.requiredPatch,
      96.5,
    );
    expect(good1.accepted).toBe(true);
    expect(good1.state.alarms.runaway_ingestion_storm.status).toBe("stabilized");
    expect(good1.state.alarms.runaway_ingestion_storm.overtime).toBe(true);
    expect(good1.state.alarms.runaway_ingestion_storm.consecutiveSlaTicks).toBe(3);

    // Complete alarms 2 and 3 within 90s
    let next = startCrewAlarm(good1.state, "sso_cert_expiring_24h");
    next = applyCrewRemediation(
      next,
      "sso_cert_expiring_24h",
      preset.crewDrillScenarios[1]!.expectedRemediation.requiredPatch,
      18.2,
    ).state;

    next = startCrewAlarm(next, "dead_p1_alert_channel");
    next = applyCrewRemediation(
      next,
      "dead_p1_alert_channel",
      preset.crewDrillScenarios[2]!.expectedRemediation.requiredPatch,
      14.0,
    ).state;

    const summary = summarizeCrewDrill(next, "2026-11-20T16:35:00.000Z");
    expect(summary.allStabilized).toBe(true);
    expect(summary.stabilizedCount).toBe(3);
    expect(summary.overtimeCount).toBe(1);
    expect(summary.passedCleanly).toBe(false);
  });
});

describe("@nominalx/core — Signed Dossier, Day-1 Runbook & Reporting Engine", () => {
  it("generates deterministic SHA-256 signed dossiers and exec/ops/waivers reports in md, json, and slack", () => {
    const preset = ACCOUNT_PRESETS["meridian-fintech"];
    const g1 = simulateFlightCheckForPreset("meridian-fintech", {
      patchedStations: ["RESIDENCY", "WEBHOOKS"],
    });
    const g2Initial = simulateStaticFireForPreset("meridian-fintech");
    const g2Final = simulateStaticFireForPreset("meridian-fintech", {
      patchedVectors: ["duplicate_webhook", "out_of_order", "dual_hmac_rotation"],
      previousAttempts: g2Initial.attemptHistory,
    });
    const g3 = simulateCompletedCrewDrillForPreset("meridian-fintech");

    const journey = computeJourneyState({
      flightCheck: g1,
      staticFire: g2Final,
      crewDrill: g3,
      dossierSigned: true,
    });
    expect(journey.masterVerdict).toBe("CONDITIONAL_GO");
    expect(journey.activeWaiverCount).toBe(1);

    const d1 = buildDossier({
      config: preset.config,
      gate1: g1,
      gate2: g2Final,
      gate3: g3,
      generatedAt: "2026-11-20T17:00:00.000Z",
    });
    const d2 = buildDossier({
      config: preset.config,
      gate1: g1,
      gate2: g2Final,
      gate3: g3,
      generatedAt: "2026-11-20T17:00:00.000Z",
    });

    expect(d1.verdict).toBe("NOMINAL_WITH_WAIVERS");
    expect(d1.verificationDigest).toBe(d2.verificationDigest);
    expect(d1.runbook.activeWaiverPlaybooks).toHaveLength(1);
    expect(d1.runbook.sections.length).toBeGreaterThanOrEqual(6);

    const md = renderDossier(d1, "md");
    const json = renderDossier(d1, "json");
    const slack = renderDossier(d1, "slack");

    expect(md).toContain("Gate 1: Flight Check · Setup Check");
    expect(md).toContain("Gate 2: Static Fire · Fault Injection");
    expect(md).toContain("Gate 3: Crew Drill · Live Incident Drill");
    expect(md).toContain(d1.verificationDigest);
    expect(JSON.parse(json).verificationDigest).toBe(d1.verificationDigest);
    expect(slack).toContain("*NOMINALX GO-LIVE DOSSIER");
    expect(slack).toContain("ROLLBACK");

    for (const type of ["exec", "ops", "waivers"] as const) {
      const report = buildReport(type, {
        config: preset.config,
        gate1: g1,
        gate2: g2Final,
        gate3: g3,
        dossierSigned: true,
        generatedAt: "2026-11-20T17:00:00.000Z",
      });
      expect(report.verificationDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
      for (const fmt of ["md", "json", "slack"] as const) {
        const out = renderReport(report, fmt);
        expect(out.length).toBeGreaterThan(80);
        if (fmt === "json") {
          expect(JSON.parse(out).reportType).toBe(type);
        }
      }
    }
  });
});
