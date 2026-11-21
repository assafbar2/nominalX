import { describe, expect, it } from "vitest";
import { ACCOUNT_PRESETS } from "@nominalx/core";
import {
  computeMissionJourney,
  computeReadinessScore,
  createInitialMissionState,
  evaluatePresetFlightCheck,
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
});
