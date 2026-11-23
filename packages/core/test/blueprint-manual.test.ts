import { describe, expect, it } from "vitest";
import {
  blueprintFromNominalXConfig,
  compileBlueprintToConfig,
  createBlankCustomerBlueprint,
  createDefaultBlueprintInput,
  createInitialManualGateState,
  evaluateManualCustomerGates,
  generateCustomerBlueprint,
  parseNominalXConfigYaml,
  serializeNominalXConfigYaml,
  validateManualWaiver,
  type CustomerBlueprintInput,
} from "../src/index.js";

describe("@nominalx/core — deterministic B2B Customer Setup Blueprint Generator", () => {
  it("generates Hard Stops, data-flow checks, fault tests, and drills with clear whyAdded rationales", () => {
    const input: CustomerBlueprintInput = {
      ...createDefaultBlueprintInput("2026-11-22"),
      companyName: "Northstar Cloud Corp",
      deploymentModel: "dedicated_vpc",
      dealScopeSummary: "Real-time webhooks, Kafka streaming, and Snowflake warehouse sync",
      leadFde: "alex.rivera@vendor.io",
      leadCse: "priya.nair@vendor.io",
      enterpriseSsoSaml: true,
      ssoProtocol: "saml2",
      regionalDataResidency: true,
      residencyRegion: "eu",
      regulatedData: ["hipaa", "pci_dss", "soc2_pii"],
      privateNetworkingIpAllowlist: true,
      dataFlows: [
        "apis",
        "webhooks",
        "batch_imports",
        "event_streaming",
        "db_warehouse_sync",
        "installed_agent_sdk",
      ],
      reliabilityTier: "high_volume",
      customerHasOwnOnCall: false,
      targetP1ResponseMinutes: 5,
    };

    const bp = generateCustomerBlueprint(input);
    expect(bp.slug).toBe("northstar-cloud-corp");

    const enabledG1 = bp.gate1Items.filter((i) => i.enabled);
    const enabledG2 = bp.gate2Items.filter((i) => i.enabled);
    const enabledG3 = bp.gate3Items.filter((i) => i.enabled);

    // Security & Compliance Hard Stops generated & locked
    const hardStopIds = enabledG1.filter((i) => i.isHardStop).map((i) => i.id);
    expect(hardStopIds).toContain("AUTH_SSO");
    expect(hardStopIds).toContain("RESIDENCY");
    expect(hardStopIds).toContain("HIPAA_PHI_ENCRYPTION");
    expect(hardStopIds).toContain("PCI_PAN_ISOLATION");
    expect(hardStopIds).toContain("SOC2_PII_AUDIT_TRAIL");
    expect(hardStopIds).toContain("PRIVATE_NET_ALLOWLIST");

    // Deployment + Data-flow Gate 1 checks generated
    const g1Ids = enabledG1.map((i) => i.id);
    expect(g1Ids).toContain("VPC_PEERING_ISOLATION");
    expect(g1Ids).toContain("WEBHOOKS");
    expect(g1Ids).toContain("BATCH_IMPORT_PIPELINE");
    expect(g1Ids).toContain("STREAM_BROKER_CONTRACT");
    expect(g1Ids).toContain("WAREHOUSE_SYNC_CONTRACT");
    expect(g1Ids).toContain("AGENT_SDK_TELEMETRY");

    // Matching Gate 2 fault-injection tests generated
    const g2Ids = enabledG2.map((i) => i.id);
    expect(g2Ids).toContain("duplicate_webhook");
    expect(g2Ids).toContain("dual_hmac_rotation");
    expect(g2Ids).toContain("malformed_batch_partial_retry");
    expect(g2Ids).toContain("stream_poison_pill_dlq");
    expect(g2Ids).toContain("warehouse_schema_drift_backfill");
    expect(g2Ids).toContain("sdk_offline_buffer_reconnect");

    // Vendor-led P1 escalation drill added when customerHasOwnOnCall === false + 60s timer for 5m P1
    const g3Ids = enabledG3.map((i) => i.id);
    expect(g3Ids).toContain("vendor_led_p1_escalation_bridge");
    expect(enabledG3.every((a) => a.timerSeconds === 60)).toBe(true);

    // Every generated item carries a clear one-line "Why we added this" rationale
    for (const item of [...enabledG1, ...enabledG2, ...enabledG3]) {
      expect(item.whyAdded.trim().length).toBeGreaterThan(20);
    }

    // Compiles to a 100% schema-valid NominalXConfig that round-trips cleanly via YAML
    const config = compileBlueprintToConfig(bp);
    expect(config.sold_contract.residency.allowed_regions).toEqual([
      "eu-central-1",
      "eu-west-1",
    ]);
    expect(config.sold_contract.quota.guaranteed_rps).toBe(50000);
    expect(config.sold_contract.rollback.max_rto_minutes).toBe(5);

    const yaml = serializeNominalXConfigYaml(config);
    const reparsed = parseNominalXConfigYaml(yaml);
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) {
      expect(reparsed.config.account.id).toBe("northstar-cloud-corp");
      expect(reparsed.config.custom_stations?.length).toBeGreaterThanOrEqual(8);
      expect(reparsed.config.custom_vectors).toHaveLength(4);
      expect(reparsed.config.custom_alarms).toHaveLength(1);
    }
  });

  it("supports Self-Hosted deployment checks, Blank Template starter, and reverse YAML mapping", () => {
    const selfHosted = generateCustomerBlueprint({
      ...createDefaultBlueprintInput("2026-11-22"),
      companyName: "Citadel OnPrem",
      deploymentModel: "self_hosted_on_prem",
      enterpriseSsoSaml: false,
      regionalDataResidency: false,
      regulatedData: [],
      dataFlows: ["apis"],
    });
    expect(
      selfHosted.gate1Items.some((i) => i.id === "SELF_HOSTED_PREFLIGHT" && i.enabled),
    ).toBe(true);
    expect(
      selfHosted.gate3Items.some(
        (i) => i.id === "self_hosted_upgrade_rollback_drill" && i.enabled,
      ),
    ).toBe(true);

    const blank = createBlankCustomerBlueprint({ companyName: "Minimal Inc" });
    expect(blank.gate1Items.filter((i) => i.enabled)).toHaveLength(2);
    expect(blank.gate2Items.filter((i) => i.enabled)).toHaveLength(1);
    expect(blank.gate3Items.filter((i) => i.enabled)).toHaveLength(1);

    const blankCfg = compileBlueprintToConfig(blank);
    const parsed = parseNominalXConfigYaml(serializeNominalXConfigYaml(blankCfg));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const rebuilt = blueprintFromNominalXConfig(parsed.config);
      expect(rebuilt.slug).toBe("minimal-inc");
    }
  });
});

describe("@nominalx/core — interactive manual gate checking & Hard Stop enforcement", () => {
  it("strictly forbids waiving built-in, compliance, or user-locked Hard Stops while enforcing <=30d & max-2 operational waivers", () => {
    const bp = generateCustomerBlueprint({
      ...createDefaultBlueprintInput("2026-11-22"),
      companyName: "Aurora Bio",
      regulatedData: ["hipaa"],
      dataFlows: ["apis", "webhooks"],
    });
    // Promote operational WEBHOOKS check to Hard Stop in Step 5
    bp.gate1Items = bp.gate1Items.map((item) =>
      item.id === "WEBHOOKS" ? { ...item, isHardStop: true } : item,
    );
    const cfg = compileBlueprintToConfig(bp);

    const sampleWaiver = {
      station: "AUTH_SSO",
      owner: "alex.rivera@vendor.io",
      reason: "Attempted temporary bypass",
      expires_at: "2026-12-05",
      rollback_plan: "Re-enable SSO",
      issued_at: "2026-11-22",
    };

    // 1. Built-in Hard Stop blocked
    const authRes = validateManualWaiver({
      stationCode: "AUTH_SSO",
      stationLabel: "AUTH / SSO",
      isHardStop: true,
      waiver: sampleWaiver,
      existingActiveWaivers: [],
      referenceDate: "2026-11-22",
      customStations: cfg.custom_stations,
    });
    expect(authRes.ok).toBe(false);
    if (!authRes.ok) {
      expect(authRes.violationCode).toBe("HARD_STOP_WAIVER_FORBIDDEN");
    }

    // 2. Regulated custom Hard Stop blocked
    const hipaaRes = validateManualWaiver({
      stationCode: "HIPAA_PHI_ENCRYPTION",
      stationLabel: "HIPAA PHI Encryption & BAA Audit",
      isHardStop: true,
      waiver: { ...sampleWaiver, station: "HIPAA_PHI_ENCRYPTION" },
      existingActiveWaivers: [],
      referenceDate: "2026-11-22",
      customStations: cfg.custom_stations,
    });
    expect(hipaaRes.ok).toBe(false);

    // 3. Operational check promoted to Hard Stop blocked even in evaluateManualCustomerGates
    const manualState = createInitialManualGateState(bp);
    manualState.gate1.WEBHOOKS = {
      status: "WAIVED",
      evidenceNote: "Tried to force waiver",
      waiver: { ...sampleWaiver, station: "WEBHOOKS" },
    };
    const evaluated = evaluateManualCustomerGates({
      config: cfg,
      blueprint: bp,
      manualState,
      referenceDate: "2026-11-22",
    });
    expect(evaluated.flightCheck.verdict).toBe("NO_GO");
    expect(evaluated.flightCheck.waiverAudit.hardStopViolations).toHaveLength(1);
    expect(
      evaluated.flightCheck.stations.find((s) => s.stationCode === "WEBHOOKS")?.status,
    ).toBe("NO_GO");

    // 4. Operational waiver exceeding 30 days is rejected
    const tooLong = validateManualWaiver({
      stationCode: "ROLLBACK",
      stationLabel: "ROLLBACK",
      isHardStop: false,
      waiver: {
        ...sampleWaiver,
        station: "ROLLBACK",
        expires_at: "2027-01-15",
      },
      existingActiveWaivers: [],
      referenceDate: "2026-11-22",
      customStations: cfg.custom_stations,
    });
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) {
      expect(tooLong.violationCode).toBe("WAIVER_EXCEEDS_30_DAYS");
    }

    // 5. Valid operational waiver passes & transitions Gate 1 to CONDITIONAL_GO when rest are PASS
    const validRoll = validateManualWaiver({
      stationCode: "ROLLBACK",
      stationLabel: "ROLLBACK",
      isHardStop: false,
      waiver: {
        ...sampleWaiver,
        station: "ROLLBACK",
        expires_at: "2026-12-10",
      },
      existingActiveWaivers: [],
      referenceDate: "2026-11-22",
      customStations: cfg.custom_stations,
    });
    expect(validRoll.ok).toBe(true);

    const allGreenState = createInitialManualGateState(bp);
    for (const key of Object.keys(allGreenState.gate1)) {
      allGreenState.gate1[key] = {
        status: "PASS",
        evidenceNote: `Verified ${key} on staging`,
      };
    }
    if (validRoll.ok) {
      allGreenState.gate1.ROLLBACK = {
        status: "WAIVED",
        evidenceNote: "Manual failover script tested",
        waiver: validRoll.waiver,
      };
    }
    for (const key of Object.keys(allGreenState.gate2)) {
      allGreenState.gate2[key] = {
        status: "PASS",
        evidenceNote: `0% corruption on ${key}`,
      };
    }
    for (const key of Object.keys(allGreenState.gate3)) {
      allGreenState.gate3[key] = {
        status: "PASS",
        evidenceNote: `Stabilized ${key} in 32s`,
        splitSeconds: 32,
      };
    }

    const doneEval = evaluateManualCustomerGates({
      config: cfg,
      blueprint: bp,
      manualState: allGreenState,
      referenceDate: "2026-11-22",
    });
    expect(doneEval.flightCheck.verdict).toBe("CONDITIONAL_GO");
    expect(doneEval.flightCheck.counts.hardStopFailures).toBe(0);
    expect(doneEval.staticFire.passed).toBe(true);
    expect(doneEval.staticFire.grade).toBe("A");
    expect(doneEval.staticFire.corruptionPct).toBe(0);
    expect(doneEval.crewSummary.allStabilized).toBe(true);
  });
});
