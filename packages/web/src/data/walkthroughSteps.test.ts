import { describe, expect, it } from "vitest";
import {
  clearWalkthroughSeen,
  hasSeenWalkthrough,
  markWalkthroughSeen,
  WALKTHROUGH_CHAPTER_PREVIEWS,
  WALKTHROUGH_STEPS,
  WALKTHROUGH_STORAGE_KEY,
  WALKTHROUGH_WELCOME_META,
} from "./walkthroughSteps";

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe("WALKTHROUGH_STEPS catalog", () => {
  it("contains a deep 12-step guided walkthrough with unique IDs and structured highlights", () => {
    expect(WALKTHROUGH_STEPS.length).toBe(12);

    const seenIds = new Set<string>();
    for (const step of WALKTHROUGH_STEPS) {
      expect(step.id.trim().length).toBeGreaterThan(2);
      expect(seenIds.has(step.id), `duplicate step id: ${step.id}`).toBe(false);
      seenIds.add(step.id);

      expect(step.chapter.trim().length).toBeGreaterThan(2);
      expect(step.title.trim().length).toBeGreaterThan(6);
      expect(step.summary.trim().length).toBeGreaterThan(40);
      expect(step.highlights.length).toBeGreaterThanOrEqual(2);
      expect(step.highlights.length).toBeLessThanOrEqual(3);

      for (const h of step.highlights) {
        expect(h.label.trim().length).toBeGreaterThan(2);
        expect(h.detail.trim().length).toBeGreaterThan(20);
      }
    }
  });

  it("opens on Step 1 with the Unverified Gap goal, Jira/Linear/Monday positioning, and Live Customer Readiness", () => {
    const first = WALKTHROUGH_STEPS[0]!;
    expect(first.id).toBe("welcome-goal");
    expect(first.placement).toBe("center");
    expect(first.targetSelector).toBeUndefined();

    expect(WALKTHROUGH_WELCOME_META.headline).toContain("Unverified Gap");
    expect(WALKTHROUGH_WELCOME_META.headline).toContain("Live Customer Readiness");
    expect(WALKTHROUGH_WELCOME_META.quote).toContain("Sales says the account is green");
    expect(WALKTHROUGH_WELCOME_META.quote).toContain("Nothing is nominal until telemetry proves it");
    expect(WALKTHROUGH_WELCOME_META.positioningTitle).toContain("Jira");
    expect(WALKTHROUGH_WELCOME_META.positioningTitle).toContain("Linear");
    expect(WALKTHROUGH_WELCOME_META.positioningTitle).toContain("Monday");
    expect(WALKTHROUGH_WELCOME_META.positioningBody).toContain("Live Customer Readiness");

    expect(WALKTHROUGH_CHAPTER_PREVIEWS.length).toBeGreaterThanOrEqual(4);
    for (const preview of WALKTHROUGH_CHAPTER_PREVIEWS) {
      expect(preview.stepIndex).toBeGreaterThan(0);
      expect(preview.stepIndex).toBeLessThan(WALKTHROUGH_STEPS.length);
    }
  });

  it("drives all cockpit views (gate1, gate2, gate3, reports) and opens/closes the Customize drawer cleanly", () => {
    const views = new Set(WALKTHROUGH_STEPS.map((s) => s.view));
    expect(views.has("gate1")).toBe(true);
    expect(views.has("gate2")).toBe(true);
    expect(views.has("gate3")).toBe(true);
    expect(views.has("reports")).toBe(true);

    // Steps 2..12 all define data-tour target selectors
    for (const step of WALKTHROUGH_STEPS.slice(1)) {
      expect(step.targetSelector, `${step.id} targetSelector`).toMatch(
        /^\[data-tour="[^"]+"\]$/,
      );
    }

    // Step 11 opens the Customize drawer; Step 12 closes it and returns to Gate 1
    const customizeStep = WALKTHROUGH_STEPS.find((s) => s.id === "customize-yaml");
    expect(customizeStep?.openDrawer).toBe("customize");

    const finalStep = WALKTHROUGH_STEPS[WALKTHROUGH_STEPS.length - 1]!;
    expect(finalStep.view).toBe("gate1");
    expect(finalStep.openDrawer).toBe("none");
    expect(finalStep.targetSelector).toBe('[data-tour="tour-replay-wrap"]');
  });
});

describe("walkthrough first-run persistence helpers", () => {
  it("tracks seen state under nominalx-walkthrough-seen-v1 and handles unavailable storage safely", () => {
    expect(WALKTHROUGH_STORAGE_KEY).toBe("nominalx-walkthrough-seen-v1");

    const storage = createMemoryStorage();
    expect(hasSeenWalkthrough(storage)).toBe(false);

    markWalkthroughSeen(storage);
    expect(storage.getItem(WALKTHROUGH_STORAGE_KEY)).toBe("1");
    expect(hasSeenWalkthrough(storage)).toBe(true);

    clearWalkthroughSeen(storage);
    expect(hasSeenWalkthrough(storage)).toBe(false);

    // Null / unavailable storage never throws
    expect(hasSeenWalkthrough(null)).toBe(false);
    expect(() => markWalkthroughSeen(null)).not.toThrow();
    expect(() => clearWalkthroughSeen(null)).not.toThrow();
  });
});
