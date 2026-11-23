import { describe, expect, it } from "vitest";
import {
  createDefaultBlueprintInput,
  generateCustomerBlueprint,
} from "@nominalx/core";
import { computeDeliverableLiveStatus } from "../components/ReportsDossierHub";
import { computeReadinessScore } from "./missionState";
import {
  buildCustomerCockpitModel,
  createCustomerRecordFromBlueprint,
  duplicateCustomerRecord,
  exportCustomerToYaml,
  exportWorkspaceBackupJson,
  importCustomerRecordFromYaml,
  parseWorkspaceBackupJson,
  resolveInitialRoute,
  setManualGate1Evidence,
  setManualGate1Status,
  setManualGate2Status,
  setManualGate3Status,
  updateCustomerRecordBlueprint,
} from "./workspaceState";

describe("web workspaceState — routing, manual checking, and portable export/import", () => {
  it("routes brand-new visitors to First-Run Launchpad and returning customer visitors straight to their active customer", () => {
    // 1. Brand-new visitor (0 customers, launchpad not dismissed)
    const freshRoute = resolveInitialRoute({
      myCustomers: [],
      prefs: { launchpadDismissed: false },
    });
    expect(freshRoute.screen).toBe("launchpad");

    // 2. Visitor who dismissed launchpad with 0 customers -> opens last sample
    const sampleRoute = resolveInitialRoute({
      myCustomers: [],
      prefs: { launchpadDismissed: true, lastActiveSampleId: "kestrel-health" },
    });
    expect(sampleRoute.screen).toBe("cockpit");
    expect(sampleRoute.accountKind).toBe("sample");
    expect(sampleRoute.sampleId).toBe("kestrel-health");

    // 3. Returning visitor with >= 1 customer opens straight into their most recently active customer
    const bp1 = generateCustomerBlueprint({
      ...createDefaultBlueprintInput("2026-11-22"),
      companyName: "Alpha Robotics",
    });
    const bp2 = generateCustomerBlueprint({
      ...createDefaultBlueprintInput("2026-11-22"),
      companyName: "Beta Cloud",
    });
    const c1 = createCustomerRecordFromBlueprint(bp1, [], "2026-11-22T10:00:00.000Z");
    const c2 = createCustomerRecordFromBlueprint(bp2, [c1.id], "2026-11-22T11:00:00.000Z");

    const returningLastActive = resolveInitialRoute({
      myCustomers: [c1, c2],
      prefs: { launchpadDismissed: false, lastActiveCustomerId: c1.id },
    });
    expect(returningLastActive.screen).toBe("cockpit");
    expect(returningLastActive.accountKind).toBe("customer");
    expect(returningLastActive.customerId).toBe(c1.id);

    // Without lastActiveCustomerId, selects the most recently updated customer
    const returningMostRecent = resolveInitialRoute({
      myCustomers: [c1, c2],
      prefs: { launchpadDismissed: false },
    });
    expect(returningMostRecent.screen).toBe("cockpit");
    expect(returningMostRecent.customerId).toBe(c2.id);
  });

  it("recomputes readiness score and Live Deliverable status dynamically from manual gate checks & blocks Hard Stop waivers", () => {
    const bp = generateCustomerBlueprint({
      ...createDefaultBlueprintInput("2026-11-22"),
      companyName: "Vertex Payments",
      enterpriseSsoSaml: true,
      regionalDataResidency: true,
      regulatedData: [],
      dataFlows: ["webhooks"],
    });
    let rec = createCustomerRecordFromBlueprint(bp, [], "2026-11-22T12:00:00.000Z");

    // Initially blocked by unverified Hard Stops
    const initialModel = buildCustomerCockpitModel(rec);
    expect(computeReadinessScore(initialModel.mission)).toBeLessThanOrEqual(65);
    expect(computeDeliverableLiveStatus(initialModel.mission).label).toBe(
      "Blocked by Hard Stop · Draft",
    );

    // Attempting to waive AUTH_SSO Hard Stop is strictly rejected
    const illegalWaiver = setManualGate1Status(
      rec,
      "AUTH_SSO",
      "WAIVED",
      {
        station: "AUTH_SSO",
        owner: "alex.rivera@vendor.io",
        reason: "Skip SSO for now",
        expires_at: "2026-12-05",
        rollback_plan: "Re-enable later",
        issued_at: "2026-11-22",
      },
      "2026-11-22T12:05:00.000Z",
    );
    expect(illegalWaiver.ok).toBe(false);
    if (!illegalWaiver.ok) {
      expect(illegalWaiver.error).toContain("HARD STOP");
    }

    // Pass all Gate 1 checks + add evidence note, except issue valid operational waiver on ROLLBACK
    for (const item of rec.blueprint.gate1Items.filter((i) => i.enabled)) {
      if (item.id === "ROLLBACK") continue;
      const res = setManualGate1Status(rec, item.id, "PASS", undefined, "2026-11-22T12:10:00.000Z");
      expect(res.ok).toBe(true);
      if (res.ok) rec = res.record;
      rec = setManualGate1Evidence(rec, item.id, `PR #101 verified ${item.label}`);
    }

    const rollbackWaiver = setManualGate1Status(
      rec,
      "ROLLBACK",
      "WAIVED",
      {
        station: "ROLLBACK",
        owner: "eng-lead@vertex-payments.example",
        reason: "Blue/green automation ships next sprint",
        expires_at: "2026-12-05",
        rollback_plan: "Run verified manual DNS revert script",
        issued_at: "2026-11-22",
      },
      "2026-11-22T12:12:00.000Z",
    );
    expect(rollbackWaiver.ok).toBe(true);
    if (rollbackWaiver.ok) rec = rollbackWaiver.record;

    // Now Hard Stops are clear and waiver is open -> Waivers Open · Draft
    const midModel = buildCustomerCockpitModel(rec);
    expect(computeDeliverableLiveStatus(midModel.mission).label).toBe(
      "Waivers Open · Draft",
    );

    // Clear ROLLBACK to PASS, pass all Gate 2 fault tests & Gate 3 drills -> Ready to Send
    const passRollback = setManualGate1Status(rec, "ROLLBACK", "PASS", undefined, "2026-11-22T12:15:00.000Z");
    if (passRollback.ok) rec = passRollback.record;
    for (const v of rec.blueprint.gate2Items.filter((i) => i.enabled)) {
      rec = setManualGate2Status(rec, v.id, "PASS");
    }
    for (const a of rec.blueprint.gate3Items.filter((i) => i.enabled)) {
      rec = setManualGate3Status(rec, a.id, "PASS", 28.4);
    }

    const finalModel = buildCustomerCockpitModel(rec);
    expect(computeReadinessScore(finalModel.mission)).toBe(95);
    expect(computeDeliverableLiveStatus(finalModel.mission).label).toBe(
      "Ready to Send",
    );
  });

  it("round-trips customer nominalx.yaml and full workspace JSON backups cleanly and rejects invalid imports", () => {
    const bp = generateCustomerBlueprint({
      ...createDefaultBlueprintInput("2026-11-22"),
      companyName: "Orbit Telemetry",
      regulatedData: ["soc2_pii"],
      dataFlows: ["apis", "batch_imports"],
    });
    let rec = createCustomerRecordFromBlueprint(bp, []);
    rec = setManualGate1Evidence(rec, "AUTH_SSO", "Okta SAML verified 2026-11-22");
    const passAuth = setManualGate1Status(rec, "AUTH_SSO", "PASS");
    if (passAuth.ok) rec = passAuth.record;

    // 1. YAML Export -> Import round-trip
    const yaml = exportCustomerToYaml(rec);
    expect(yaml).toContain("orbit-telemetry");
    expect(yaml).toContain("SOC2_PII_AUDIT_TRAIL");
    expect(yaml).toContain("BATCH_IMPORT_PIPELINE");

    const importedYaml = importCustomerRecordFromYaml(yaml, [rec.id]);
    expect(importedYaml.ok).toBe(true);
    if (importedYaml.ok) {
      expect(importedYaml.record.id).toBe("orbit-telemetry-2");
      expect(importedYaml.record.config.account.name).toBe("Orbit Telemetry");
    }

    // Invalid YAML returns helpful validation errors
    const badYaml = importCustomerRecordFromYaml("schema_version: '2.0'\naccount: {}", []);
    expect(badYaml.ok).toBe(false);
    if (!badYaml.ok) {
      expect(badYaml.errors.length).toBeGreaterThan(0);
    }

    // 2. Full Workspace JSON Backup Export -> Import round-trip
    const copy = duplicateCustomerRecord(rec, [rec.id]);
    const backupJson = exportWorkspaceBackupJson([rec, copy]);
    const restored = parseWorkspaceBackupJson(backupJson, []);
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(restored.imported).toHaveLength(2);
      expect(restored.imported[0]!.manualState.gate1.AUTH_SSO?.status).toBe("PASS");
      expect(restored.imported[0]!.manualState.gate1.AUTH_SSO?.evidenceNote).toBe(
        "Okta SAML verified 2026-11-22",
      );
    }

    // Invalid JSON backup returns clear error
    const badJson = parseWorkspaceBackupJson('{"format":"wrong"}', []);
    expect(badJson.ok).toBe(false);

    // Editing blueprint preserves evidence notes on existing checks
    const edited = updateCustomerRecordBlueprint(rec, {
      ...rec.blueprint,
      input: { ...rec.blueprint.input, dealScopeSummary: "Updated scope" },
    });
    expect(edited.manualState.gate1.AUTH_SSO?.evidenceNote).toBe(
      "Okta SAML verified 2026-11-22",
    );
  });
});
