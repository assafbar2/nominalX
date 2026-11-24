import type { CockpitView } from "../state/missionState";

export const WALKTHROUGH_STORAGE_KEY = "nominalx-walkthrough-seen-v1";

export type WalkthroughPlacement =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right";

export type WalkthroughDrawer = "none" | "governance" | "customize";

export type WalkthroughChapterId =
  | "welcome"
  | "mission"
  | "pipeline"
  | "readiness"
  | "sprint"
  | "gate1"
  | "gate2"
  | "gate3"
  | "reports"
  | "customize";

export interface WalkthroughStep {
  id: string;
  chapterId: WalkthroughChapterId;
  chapter: string;
  title: string;
  summary: string;
  /** Single crisp takeaway badge/line — keeps every spotlight step focused on one concept. */
  takeaway?: { label: string; detail: string };
  targetSelector?: string;
  view: CockpitView;
  openDrawer?: WalkthroughDrawer;
  placement: WalkthroughPlacement;
  ctaLabel?: string;
}

export interface WalkthroughChapterMeta {
  id: WalkthroughChapterId;
  shortLabel: string;
  firstStepIndex: number;
}

export interface WalkthroughChapterPreview {
  id: string;
  stepIndex: number;
  tag: string;
  title: string;
  summary: string;
}

export const WALKTHROUGH_WELCOME_META = {
  badge: "LIVE CUSTOMER READINESS · INTERACTIVE WALKTHROUGH",
  headline: 'Close "The Unverified Gap" with Live Customer Readiness',
  quote:
    "Sales says the account is green. Nothing is nominal until telemetry proves it.",
  goalTitle: "The Goal",
  goalBody:
    'Close "The Unverified Gap" bridging Deal Close and live Support — proving customer staging is ready across Gate 1, Gate 2, and Gate 3 before broken integrations turn into a Day-1 outage.',
  positioningTitle: "Jira, Linear & Monday — With Engineering Opinions",
  positioningBody:
    "NominalX pairs sprint discipline and single-owner accountability with Live Customer Readiness: real telemetry from the customer's actual staging environment, not manual green checkboxes, slides, or spreadsheets.",
} as const;

export const WALKTHROUGH_CHAPTER_PREVIEWS: readonly WalkthroughChapterPreview[] =
  [
    {
      id: "preview-mission-pipeline",
      stepIndex: 1,
      tag: "STEPS 2–8",
      title: "Mission, Pipeline & Readiness",
      summary:
        "Account presets, Gate 1–3 baton owners, Deal Close & Support bookends, Hard Stop Locks, and stack context.",
    },
    {
      id: "preview-sprint-gate1",
      stepIndex: 8,
      tag: "STEPS 9–13",
      title: "Governance & Gate 1: Setup Check",
      summary:
        "Sprint contracts, parallel staging probes, Hard Stops vs. waivers, and wire diffs.",
    },
    {
      id: "preview-gate2",
      stepIndex: 13,
      tag: "STEPS 14–15",
      title: "Gate 2: Fault Injection",
      summary:
        "Static Fire failure vectors, 0.0% corruption target (Grade A), and patch switchboard.",
    },
    {
      id: "preview-gate3",
      stepIndex: 15,
      tag: "STEPS 16–17",
      title: "Gate 3: Live Incident Drill",
      summary:
        "90-second P1 alert rehearsals and tactile runbook fixes for Support & SREs.",
    },
    {
      id: "preview-reports-yaml",
      stepIndex: 17,
      tag: "STEPS 18–21",
      title: "Reports, YAML & ? Help",
      summary:
        "Signed SHA-256 Dossier, 4 audience views, 2-way nominalx.yaml, and inline help.",
    },
  ];

export const WALKTHROUGH_STEPS: readonly WalkthroughStep[] = [
  // ── 1. Welcome & Positioning ───────────────────────────────────────────────
  {
    id: "welcome-goal",
    chapterId: "welcome",
    chapter: "Welcome",
    title: WALKTHROUGH_WELCOME_META.headline,
    summary: WALKTHROUGH_WELCOME_META.positioningBody,
    takeaway: {
      label: "Live Customer Readiness",
      detail:
        "Real probes, controlled fault injection, and timed P1 drills against customer staging.",
    },
    view: "gate1",
    openDrawer: "none",
    placement: "center",
    ctaLabel: "Start Guided Walkthrough",
  },

  // ── 2. Top Mission Bar ─────────────────────────────────────────────────────
  {
    id: "mission-bar",
    chapterId: "mission",
    chapter: "Mission Control",
    title: "Top Mission Bar & Enterprise Presets",
    summary:
      "Switch between four realistic enterprise launch scenarios, inspect live HTTP probes in the Wire Log, reset the active account anytime, or toggle Dark and Light modes.",
    takeaway: {
      label: "Independent Account State",
      detail:
        "Meridian, Kestrel, Vanguard, and Helios each keep their own fixes, waivers, drills, and custom YAML.",
    },
    targetSelector: '[data-tour="mission-bar"]',
    view: "gate1",
    openDrawer: "none",
    placement: "bottom",
  },

  // ── 3a–3c. Customer Lifecycle Pipeline (Split into 3 Targeted Steps) ───────
  {
    id: "pipeline-stages-owners",
    chapterId: "pipeline",
    chapter: "Lifecycle Pipeline",
    title: "Gate 1, Gate 2 & Gate 3 Between Deal Close and Support",
    summary:
      "Deal Close (left) and Support + Renewal & Expansion (right) sit as unnumbered bookends around the only three numbered readiness stages — Gate 1, Gate 2, and Gate 3 — each with one clear owner (Lead FDE, Lead CSE, Support Engineer, TAM).",
    takeaway: {
      label: "Zero Ownership Ambiguity",
      detail:
        "Every gate names its plain-language job (Setup Check, Fault Injection, Live Incident Drill) and single owner.",
    },
    targetSelector: '[data-tour="journey-stages-grid"]',
    view: "gate1",
    openDrawer: "none",
    placement: "bottom",
  },
  {
    id: "pipeline-telemetry-verdict",
    chapterId: "pipeline",
    chapter: "Lifecycle Pipeline",
    title: "Locked to Live Telemetry — Never Manual Checkboxes",
    summary:
      "The Baton Owner badge, MASTER verdict pill, and gate LED strips update automatically from deterministic staging probes — there are no manual status dropdowns to game.",
    takeaway: {
      label: "Truth From Staging",
      detail:
        "MASTER stays NO-GO until every Hard Stop passes and operational checks are green or validly waived.",
    },
    targetSelector: '[data-tour="journey-verdict-controls"]',
    view: "gate1",
    openDrawer: "none",
    placement: "bottom",
  },
  {
    id: "pipeline-unverified-gap",
    chapterId: "pipeline",
    chapter: "Lifecycle Pipeline",
    title: '"The Unverified Gap" & Interactive Gate Navigation',
    summary:
      "Gate 1, Gate 2, and Gate 3 bridge the missing in-between gap between Deal Close and live Support. Click Gates 1–3 to run checks, Deal Close / Support / Renewal for governance charters, or Live Launch Deliverables above.",
    takeaway: {
      label: "3 Gates Closing the Gap",
      detail:
        "Setup Check (Gate 1) → Fault Injection (Gate 2) → Live Incident Drill + Signed Dossier (Gate 3).",
    },
    targetSelector: '[data-tour="journey-gap-bracket"]',
    view: "gate1",
    openDrawer: "none",
    placement: "bottom",
  },

  // ── 4a–4c. Hero Readiness Band (Split into 3 Targeted Steps) ───────────────
  {
    id: "hero-readiness-scorecards",
    chapterId: "readiness",
    chapter: "Readiness & Locks",
    title: "Deterministic Readiness Index & Gate 1–3 Scorecards",
    summary:
      "Click any scorecard to jump straight into its gate. The Readiness Index weights Gate 1 (40%), Gate 2 (35%), Gate 3 (20%), and Signed Dossier (5%) into a live NO-GO, CONDITIONAL GO, or NOMINAL verdict.",
    takeaway: {
      label: "Plain-Language Scorecards",
      detail:
        "Each card pairs the aerospace callout with its plain job: Setup Check, Fault Injection, and Live Incident Drill.",
    },
    targetSelector: '[data-tour="hero-scorecards-and-dial"]',
    view: "gate1",
    openDrawer: "none",
    placement: "bottom",
  },
  {
    id: "hero-hard-stop-lock",
    chapterId: "readiness",
    chapter: "Readiness & Locks",
    title: "Non-Waivable Hard Stop Launch Lock",
    summary:
      "Whenever a security or compliance Hard Stop fails (like Meridian's RESIDENCY check right now), launch is locked, Readiness is capped at 65%, and Risk Waivers are strictly blocked.",
    takeaway: {
      label: "1-Click Jump to Blocker",
      detail:
        "Click Fix Failing Hard Stop in Gate 1 on the right to jump straight to the failing probe diff.",
    },
    targetSelector: '[data-tour="hero-hard-stop-banner"]',
    view: "gate1",
    openDrawer: "none",
    placement: "bottom",
  },
  {
    id: "hero-account-context",
    chapterId: "readiness",
    chapter: "Readiness & Locks",
    title: "Stack-Tailored Account Context",
    summary:
      "Shows the active customer's commercial tier, target go-live date, and real infrastructure stack (Cloud, IdP, webhook runtime, and P1 alerting) straight from nominalx.yaml.",
    takeaway: {
      label: "Tailored Probes & Runbooks",
      detail:
        "Every assertion, staged fix diff, and Day-1 Runbook command adapts to this exact customer stack.",
    },
    targetSelector: '[data-tour="hero-account-card"]',
    view: "gate1",
    openDrawer: "none",
    placement: "right",
  },

  // ── 5a–5b. Sprint Governance (2 Targeted Steps) ────────────────────────────
  {
    id: "sprint-contract-strip",
    chapterId: "sprint",
    chapter: "Sprint Governance",
    title: "Sprint Contract Strip — Not Waterfall Checklists",
    summary:
      "Each gate runs as a focused engineering sprint with one clear Goal, a Single Accountable Owner, paired Vendor + Customer engineering teams, an entry Trigger, and measurable Done-When criteria.",
    takeaway: {
      label: "Opinionated Cadence",
      detail:
        "Combines Jira/Linear/Monday accountability with hard telemetry exit proof instead of endless review meetings.",
    },
    targetSelector: '[data-tour="sprint-contract-tiles"]',
    view: "gate1",
    openDrawer: "none",
    placement: "bottom",
  },
  {
    id: "sprint-scope-governance",
    chapterId: "sprint",
    chapter: "Sprint Governance",
    title: "Scope & Governance Operating Charter",
    summary:
      "Click Scope & Governance anytime to open the full operating contract for the active stage — non-negotiable Hard Stops, strict In-Scope vs. Out-of-Scope boundaries, rosters, and integrations.",
    takeaway: {
      label: "Zero Scope Creep",
      detail:
        "Makes vendor vs. customer responsibilities explicit before anyone touches production.",
    },
    targetSelector: '[data-tour="sprint-governance-btn"]',
    view: "gate1",
    openDrawer: "none",
    placement: "left",
  },

  // ── 6a–6c. Gate 1: Flight Check · Setup Check (3 Targeted Steps) ──────────
  {
    id: "gate1-parallel-probes",
    chapterId: "gate1",
    chapter: "Gate 1 · Setup Check",
    title: "Gate 1 — Flight Check (Setup Check)",
    summary:
      "Proving staging matches what Sales sold. Track live NOMINAL, WAIVED, and NO-GO counters here, and click RUN FLIGHT CHECK to re-poll every staging station in parallel.",
    takeaway: {
      label: "Auditable Wire Sweep",
      detail:
        "Every sweep refreshes live pass/fail verdicts and appends raw HTTP traces to the Wire Log.",
    },
    targetSelector: '[data-tour="gate1-header"]',
    view: "gate1",
    openDrawer: "none",
    placement: "bottom",
  },
  {
    id: "gate1-hard-stops-vs-waivers",
    chapterId: "gate1",
    chapter: "Gate 1 · Setup Check",
    title: "Hard Stops vs. Bounded Operational Risk Waivers",
    summary:
      "AUTH / SSO and RESIDENCY are non-waivable Hard Stops — live telemetry must pass. Operational stations like WEBHOOKS allow at most 2 time-boxed Risk Waivers with an owner, ≤30-day expiry, and rollback plan.",
    takeaway: {
      label: "Click Any Station Tile",
      detail:
        "Select any station tile to inspect exact promised-vs-observed drift in the Evidence Diff Inspector below.",
    },
    targetSelector: '[data-tour="gate1-stations-row1"]',
    view: "gate1",
    openDrawer: "none",
    placement: "bottom",
  },
  {
    id: "gate1-diff-remediation",
    chapterId: "gate1",
    chapter: "Gate 1 · Setup Check",
    title: "Evidence Diff Inspector & One-Click Remediation",
    summary:
      "Compare what Sales promised in nominalx.yaml against what staging actually returned. Review the exact config fix diff on the right, then click Apply Staging Fix & Re-Poll (or issue an audited waiver on operational checks).",
    takeaway: {
      label: "Zero Finger-Pointing",
      detail:
        "Red DRIFT rows and raw curl headers eliminate debates about what customer staging is actually doing.",
    },
    targetSelector: '[data-tour="gate1-diff-left"]',
    view: "gate1",
    openDrawer: "none",
    placement: "right",
  },

  // ── 7a–7b. Gate 2: Static Fire · Fault Injection (2 Targeted Steps) ───────
  {
    id: "gate2-scoreboard",
    chapterId: "gate2",
    chapter: "Gate 2 · Fault Injection",
    title: "Gate 2 — Static Fire (Fault Injection)",
    summary:
      "Controlled fault injection to prove zero corruption. We switched to Gate 2: NominalX fires 7 real failure vectors (duplicates, out-of-order events, 429 bursts, 30s timeouts, secret rotations, schema additions, clock skew) against staging.",
    takeaway: {
      label: "Target: 0.0% Corruption (Grade A)",
      detail:
        "Gate 2 stays NO-GO until every LED lamp turns green and overall resilience hits Grade A (CLI exit 0).",
    },
    targetSelector: '[data-tour="gate2-scoreboard"]',
    view: "gate2",
    openDrawer: "none",
    placement: "bottom",
  },
  {
    id: "gate2-patch-switchboard",
    chapterId: "gate2",
    chapter: "Gate 2 · Fault Injection",
    title: "Handler Patch Switchboard & Re-Fire Verification",
    summary:
      "Toggle realistic handler code fixes — or click Stage All Fixes — then click RE-FIRE TEST STAND to watch corruption drop to 0.0% with an auditable before-and-after attempt trail.",
    takeaway: {
      label: "Proven Resilience Delta",
      detail:
        "Every firing attempt is recorded directly into the Signed Dossier so leadership sees real proof of hardening.",
    },
    targetSelector: '[data-tour="gate2-patch-switchboard"]',
    view: "gate2",
    openDrawer: "none",
    placement: "top",
  },

  // ── 8a–8b. Gate 3: Crew Drill · Live Incident Drill (2 Targeted Steps) ────
  {
    id: "gate3-live-alarms",
    chapterId: "gate3",
    chapter: "Gate 3 · Incident Drill",
    title: "Gate 3 — Crew Drill (Live Incident Drill)",
    summary:
      "Timed P1 alert rehearsal for Support and Customer SREs. Zero slide decks or multiple-choice quizzes — inject live Day-30 alarms under a 90-second countdown with real telemetry charts and error logs.",
    takeaway: {
      label: "Diagnose From Real Signals",
      detail:
        "Engineers find offending keys, expiring SSO certs, and dead P1 channels directly from the live error stream.",
    },
    targetSelector: '[data-tour="gate3-live-monitor"]',
    view: "gate3",
    openDrawer: "none",
    placement: "right",
  },
  {
    id: "gate3-remediation-console",
    chapterId: "gate3",
    chapter: "Gate 3 · Incident Drill",
    title: "Tactile Runbook Remediation & 3/3 SLA Proof",
    summary:
      "Apply real configuration fixes right here in the Ops Remediation Console and verify ping recovery. Locking 3/3 consecutive green SLA ticks across all alarms proves the crew is Day-1 ready.",
    takeaway: {
      label: "Unlocks Final Handover",
      detail:
        "Stabilizing every Day-30 drill unlocks clean signing of the NOMINAL Dossier and Day-1 Customer Runbook.",
    },
    targetSelector: '[data-tour="gate3-remediation-console"]',
    view: "gate3",
    openDrawer: "none",
    placement: "left",
  },

  // ── 9a–9b. Reporting & Handover Hub (2 Targeted Steps) ────────────────────
  {
    id: "reports-signed-dossier",
    chapterId: "reports",
    chapter: "Reports & Handover",
    title: "Signed SHA-256 NOMINAL Dossier & Day-1 Runbook",
    summary:
      "We switched to the Reporting & Handover Hub. Seal Gate 1–3 evidence with multi-party signers and a tamper-evident SHA-256 verification digest, paired with an auto-generated Day-1 Runbook below.",
    takeaway: {
      label: "Tamper-Evident Handoff",
      detail:
        "If any check result or waiver changes later, the SHA-256 digest changes immediately.",
    },
    targetSelector: '[data-tour="reports-dossier-hero"]',
    view: "reports",
    openDrawer: "none",
    placement: "top",
  },
  {
    id: "reports-audience-views",
    chapterId: "reports",
    chapter: "Reports & Handover",
    title: "4 Live Audience Views & 1-Click Exports",
    summary:
      "One deterministic engine generates the Signed Dossier, Executive Readiness Brief, Operational Sprint Digest, and Waiver Aging Register — exportable to Slack, Markdown, or JSON in one click.",
    takeaway: {
      label: "Zero Manual Status Decks",
      detail:
        "VPs, FDEs, Support, and Security auditors all read from the exact same live staging telemetry.",
    },
    targetSelector: '[data-tour="reports-hub-top"]',
    view: "reports",
    openDrawer: "none",
    placement: "bottom",
  },

  // ── 10a–10b. Customize & Help (2 Targeted Steps) ──────────────────────────
  {
    id: "customize-yaml-cli",
    chapterId: "customize",
    chapter: "Customize & Help",
    title: "Live Gate Customizer (nominalx.yaml) & CLI Parity",
    summary:
      "We opened the Customize drawer on the right. Add custom Gate 1 Setup Check stations (including custom Hard Stops), toggle or author Gate 2 Fault Injection vectors and Gate 3 Live Incident Drills, and sync 2-way with nominalx.yaml.",
    takeaway: {
      label: "Identical to Offline CLI",
      detail:
        "Download nominalx.yaml to commit to Git and run the exact same checks headlessly in CI/CD.",
    },
    targetSelector: '[data-tour="customize-drawer-sheet"]',
    view: "reports",
    openDrawer: "customize",
    placement: "left",
  },
  {
    id: "contextual-help-launch",
    chapterId: "customize",
    chapter: "Ready to Launch",
    title: "Inline ? Help Everywhere & Replay Tour Anytime",
    summary:
      "We closed the drawer and returned you to Gate 1. Hover or click any ? icon across the cockpit for plain-English context, or click Tour right here in the Mission Bar to replay this walkthrough anytime.",
    takeaway: {
      label: "Your First Live Mission",
      detail:
        "Click Finish & Launch, then fix Meridian FinTech's failing RESIDENCY Hard Stop in Gate 1 to unlock launch!",
    },
    targetSelector: '[data-tour="tour-replay-wrap"]',
    view: "gate1",
    openDrawer: "none",
    placement: "bottom",
    ctaLabel: "Finish & Launch",
  },
];

export const WALKTHROUGH_CHAPTERS: readonly WalkthroughChapterMeta[] = (() => {
  const labels: Record<WalkthroughChapterId, string> = {
    welcome: "Welcome",
    mission: "Mission",
    pipeline: "Pipeline",
    readiness: "Readiness",
    sprint: "Sprint",
    gate1: "Gate 1",
    gate2: "Gate 2",
    gate3: "Gate 3",
    reports: "Reports",
    customize: "Customize",
  };
  const seen = new Set<WalkthroughChapterId>();
  const chapters: WalkthroughChapterMeta[] = [];
  WALKTHROUGH_STEPS.forEach((step, idx) => {
    if (!seen.has(step.chapterId)) {
      seen.add(step.chapterId);
      chapters.push({
        id: step.chapterId,
        shortLabel: labels[step.chapterId],
        firstStepIndex: idx,
      });
    }
  });
  return chapters;
})();

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;
type StorageRemover = Pick<Storage, "removeItem">;

function getDefaultStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasSeenWalkthrough(storage?: StorageReader | null): boolean {
  const store = storage === undefined ? getDefaultStorage() : storage;
  if (!store) return false;
  try {
    return store.getItem(WALKTHROUGH_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markWalkthroughSeen(storage?: StorageWriter | null): void {
  const store = storage === undefined ? getDefaultStorage() : storage;
  if (!store) return;
  try {
    store.setItem(WALKTHROUGH_STORAGE_KEY, "1");
  } catch {
    // Ignore storage unavailability
  }
}

export function clearWalkthroughSeen(storage?: StorageRemover | null): void {
  const store = storage === undefined ? getDefaultStorage() : storage;
  if (!store) return;
  try {
    store.removeItem(WALKTHROUGH_STORAGE_KEY);
  } catch {
    // Ignore storage unavailability
  }
}
