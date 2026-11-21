import { describe, expect, it } from "vitest";
import {
  ACCOUNT_PRESETS,
  CUSTOM_ALARM_TEMPLATES,
  CUSTOM_STATION_TEMPLATES,
  CUSTOM_VECTOR_TEMPLATES,
  GATE1_SUB_STAGES,
  GATE2_SUB_STAGES,
  GATE3_SUB_STAGES,
  LIFECYCLE_STAGES,
} from "@nominalx/core";
import {
  applyCustomizationsToMission,
  createEmptyCustomizations,
  createInitialMissionState,
} from "../state/missionState";
import {
  getAlarmHelp,
  getStageHelp,
  getStationHelp,
  getVectorHelp,
  HELP_COPY,
} from "./helpCopy";

describe("HELP_COPY catalog and dynamic helpers", () => {
  it("provides non-empty plain-human title and body for every catalog key", () => {
    const entries = Object.entries(HELP_COPY);
    expect(entries.length).toBeGreaterThanOrEqual(85);
    for (const [key, entry] of entries) {
      expect(entry.title.trim().length, `${key} title`).toBeGreaterThan(3);
      expect(entry.body.trim().length, `${key} body`).toBeGreaterThan(40);
    }
  });

  it("explains Customize +N badge, localStorage persistence, and Reset Scenario full reset", () => {
    const cust = HELP_COPY["header.customize"].body;
    expect(cust).toContain("+N");
    expect(cust).toContain("localStorage");
    expect(cust.toLowerCase()).toContain("custom stations");
    expect(cust.toLowerCase()).toContain("chaos vectors");
    expect(cust.toLowerCase()).toContain("alarms");

    const reset = HELP_COPY["header.resetScenario"].body;
    expect(reset.toLowerCase()).toContain("telemetry");
    expect(reset.toLowerCase()).toContain("patches");
    expect(reset.toLowerCase()).toContain("waivers");
    expect(reset.toLowerCase()).toContain("drills");
    expect(reset.toLowerCase()).toContain("saved customizations");
  });

  it("covers all 6 lifecycle stages, 6 core stations, 7 core vectors, and 3 core alarms", () => {
    for (const stage of LIFECYCLE_STAGES) {
      const entry = getStageHelp(stage.stageNumber);
      expect(entry.title).toContain(`Stage ${stage.stageNumber}`);
      expect(entry.body.length).toBeGreaterThan(40);
    }

    const base = createInitialMissionState("meridian-fintech", {
      skipStorage: true,
    });

    for (const meta of GATE1_SUB_STAGES) {
      const station = base.flightCheck.stations.find(
        (s) => s.stationCode === meta.stationCode,
      );
      expect(station).toBeDefined();
      const entry = getStationHelp(station!);
      expect(entry.title.length).toBeGreaterThan(5);
      expect(entry.body.length).toBeGreaterThan(40);
    }

    for (const meta of GATE2_SUB_STAGES) {
      const vector = base.staticFire.vectors.find(
        (v) => v.vectorId === meta.vectorId,
      );
      expect(vector).toBeDefined();
      const entry = getVectorHelp(vector!);
      expect(entry.title.length).toBeGreaterThan(5);
      expect(entry.body.length).toBeGreaterThan(40);
    }

    for (const meta of GATE3_SUB_STAGES) {
      const alarm = base.crewDrill.alarms[meta.alarmId];
      expect(alarm).toBeDefined();
      const entry = getAlarmHelp(alarm!);
      expect(entry.title.length).toBeGreaterThan(5);
      expect(entry.body.length).toBeGreaterThan(40);
    }
  });

  it("generates contextual help copy for custom stations, custom vectors, and custom alarms", () => {
    const preset = ACCOUNT_PRESETS["meridian-fintech"];
    const base = createInitialMissionState("meridian-fintech", {
      skipStorage: true,
    });
    const customized = applyCustomizationsToMission(preset, base, {
      ...createEmptyCustomizations(),
      customStations: [
        CUSTOM_STATION_TEMPLATES[0]!,
        CUSTOM_STATION_TEMPLATES[1]!,
      ],
      customVectors: [CUSTOM_VECTOR_TEMPLATES[0]!],
      customAlarms: [CUSTOM_ALARM_TEMPLATES[0]!],
    });

    const customHardStop = customized.flightCheck.stations.find(
      (s) => s.stationCode === CUSTOM_STATION_TEMPLATES[0]!.code,
    )!;
    const hsHelp = getStationHelp(customHardStop);
    expect(hsHelp.tag).toContain("HARD STOP");
    expect(hsHelp.body).toContain("non-waivable Hard Stop");

    const customOperational = customized.flightCheck.stations.find(
      (s) => s.stationCode === CUSTOM_STATION_TEMPLATES[1]!.code,
    )!;
    const opHelp = getStationHelp(customOperational);
    expect(opHelp.tag).toContain("OPERATIONAL");
    expect(opHelp.body).toContain("Risk Waiver");

    const customVector = customized.staticFire.vectors.find(
      (v) => v.vectorId === CUSTOM_VECTOR_TEMPLATES[0]!.id,
    )!;
    const vecHelp = getVectorHelp(customVector);
    expect(vecHelp.tag).toContain("CUSTOM");
    expect(vecHelp.body).toContain(customVector.vectorId);

    const customAlarm =
      customized.crewDrill.alarms[CUSTOM_ALARM_TEMPLATES[0]!.id]!;
    const alHelp = getAlarmHelp(customAlarm);
    expect(alHelp.tag).toContain("CUSTOM");
    expect(alHelp.body).toContain(customAlarm.scenario.metricLabel);
  });
});
