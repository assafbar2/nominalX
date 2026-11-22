import { describe, expect, it } from "vitest";
import {
  clearWalkthroughSeen,
  hasSeenWalkthrough,
  markWalkthroughSeen,
  WALKTHROUGH_CHAPTER_PREVIEWS,
  WALKTHROUGH_CHAPTERS,
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
  it("contains focused single-concept steps with unique IDs, takeaways, and clean chapter index", () => {
    expect(WALKTHROUGH_STEPS.length).toBe(21);

    const seenIds = new Set<string>();
    for (const step of WALKTHROUGH_STEPS) {
      expect(step.id.trim().length).toBeGreaterThan(2);
      expect(seenIds.has(step.id), `duplicate step id: ${step.id}`).toBe(false);
      seenIds.add(step.id);

      expect(step.chapter.trim().length).toBeGreaterThan(2);
      expect(step.title.trim().length).toBeGreaterThan(6);
      expect(step.summary.trim().length).toBeGreaterThan(40);
      if (step.takeaway) {
        expect(step.takeaway.label.trim().length).toBeGreaterThan(2);
        expect(step.takeaway.detail.trim().length).toBeGreaterThan(15);
      }
    }

    expect(WALKTHROUGH_CHAPTERS.length).toBeGreaterThanOrEqual(8);
    for (const ch of WALKTHROUGH_CHAPTERS) {
      expect(ch.firstStepIndex).toBeGreaterThanOrEqual(0);
      expect(ch.firstStepIndex).toBeLessThan(WALKTHROUGH_STEPS.length);
      expect(WALKTHROUGH_STEPS[ch.firstStepIndex]!.chapterId).toBe(ch.id);
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
    expect(WALKTHROUGH_WELCOME_META.quote).toContain(
      "Nothing is nominal until telemetry proves it",
    );
    expect(WALKTHROUGH_WELCOME_META.positioningTitle).toContain("Jira");
    expect(WALKTHROUGH_WELCOME_META.positioningTitle).toContain("Linear");
    expect(WALKTHROUGH_WELCOME_META.positioningTitle).toContain("Monday");
    expect(WALKTHROUGH_WELCOME_META.positioningBody).toContain("Live Customer Readiness");

    expect(WALKTHROUGH_CHAPTER_PREVIEWS.length).toBe(5);
    for (const preview of WALKTHROUGH_CHAPTER_PREVIEWS) {
      expect(preview.stepIndex).toBeGreaterThan(0);
      expect(preview.stepIndex).toBeLessThan(WALKTHROUGH_STEPS.length);
    }
  });

  it("splits Lifecycle Pipeline (3a/3b/3c) and Hero Readiness (4a/4b/4c) into targeted steps", () => {
    const ids = WALKTHROUGH_STEPS.map((s) => s.id);
    expect(ids).toContain("pipeline-stages-owners");
    expect(ids).toContain("pipeline-telemetry-verdict");
    expect(ids).toContain("pipeline-unverified-gap");
    expect(ids).toContain("hero-readiness-scorecards");
    expect(ids).toContain("hero-hard-stop-lock");
    expect(ids).toContain("hero-account-context");

    const allCopy = WALKTHROUGH_STEPS.map(
      (s) => `${s.chapter} ${s.title} ${s.summary} ${s.takeaway?.detail ?? ""}`,
    ).join(" ");
    expect(allCopy).toContain("Setup Check");
    expect(allCopy).toContain("Fault Injection");
    expect(allCopy).toContain("Live Incident Drill");
    expect(allCopy).toContain("Proving staging matches what Sales sold.");
    expect(allCopy).toContain("Controlled fault injection to prove zero corruption.");
    expect(allCopy).toContain("Timed P1 alert rehearsal for Support and Customer SREs.");
  });

  it("drives all cockpit views (gate1, gate2, gate3, reports) and opens/closes the Customize drawer cleanly", () => {
    const views = new Set(WALKTHROUGH_STEPS.map((s) => s.view));
    expect(views.has("gate1")).toBe(true);
    expect(views.has("gate2")).toBe(true);
    expect(views.has("gate3")).toBe(true);
    expect(views.has("reports")).toBe(true);

    for (const step of WALKTHROUGH_STEPS.slice(1)) {
      expect(step.targetSelector, `${step.id} targetSelector`).toMatch(
        /^\[data-tour="[^"]+"\]$/,
      );
    }

    const customizeStep = WALKTHROUGH_STEPS.find((s) => s.id === "customize-yaml-cli");
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

    expect(hasSeenWalkthrough(null)).toBe(false);
    expect(() => markWalkthroughSeen(null)).not.toThrow();
    expect(() => clearWalkthroughSeen(null)).not.toThrow();
  });
});
