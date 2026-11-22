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
  | "mission-control"
  | "governance"
  | "gate1"
  | "gate2"
  | "gate3"
  | "reports"
  | "customize"
  | "launch";

export interface WalkthroughHighlight {
  label: string;
  detail: string;
}

export interface WalkthroughStep {
  id: string;
  chapterId: WalkthroughChapterId;
  chapter: string;
  title: string;
  summary: string;
  highlights: readonly WalkthroughHighlight[];
  targetSelector?: string;
  view: CockpitView;
  openDrawer?: WalkthroughDrawer;
  placement: WalkthroughPlacement;
  ctaLabel?: string;
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
    'Close "The Unverified Gap" between Sales signing an enterprise deal (Stage 1) and Support inheriting production (Stage 5) — before broken staging turns into a Day-1 outage.',
  positioningTitle: "Jira, Linear & Monday — With Engineering Opinions",
  positioningBody:
    "NominalX pairs sprint discipline and single-owner accountability with Live Customer Readiness: real telemetry from the customer's actual staging environment, not manual green checkboxes, slides, or spreadsheets.",
} as const;

export const WALKTHROUGH_CHAPTER_PREVIEWS: readonly WalkthroughChapterPreview[] =
  [
    {
      id: "preview-mission",
      stepIndex: 1,
      tag: "STEPS 2–5",
      title: "Mission Control & Sprint Governance",
      summary:
        "Enterprise presets, Stages 1–6 pipeline, Hard Stop Lock, and sprint contracts.",
    },
    {
      id: "preview-gate1",
      stepIndex: 5,
      tag: "STEPS 6–7",
      title: "Gate 1: Flight Check",
      summary:
        "Live staging probes, non-waivable Hard Stops, wire diffs, and one-click fixes.",
    },
    {
      id: "preview-gate2",
      stepIndex: 7,
      tag: "STEP 8",
      title: "Gate 2: Static Fire",
      summary:
        "Controlled fault injection to 0.0% data corruption and Grade A resilience.",
    },
    {
      id: "preview-gate3",
      stepIndex: 8,
      tag: "STEP 9",
      title: "Gate 3: Crew Drill",
      summary:
        "90-second live P1 incident drills proving Support & SRE Day-1 readiness.",
    },
    {
      id: "preview-reports-yaml",
      stepIndex: 9,
      tag: "STEPS 10–12",
      title: "Reports, YAML Customizer & ? Help",
      summary:
        "Signed SHA-256 Dossier, 2-way nominalx.yaml CLI parity, and inline help.",
    },
  ];

export const WALKTHROUGH_STEPS: readonly WalkthroughStep[] = [
  {
    id: "welcome-goal",
    chapterId: "welcome",
    chapter: "Welcome",
    title: WALKTHROUGH_WELCOME_META.headline,
    summary: WALKTHROUGH_WELCOME_META.positioningBody,
    highlights: [
      {
        label: "Close The Unverified Gap",
        detail:
          "Eliminate the blind handoff between Sales closing a deal and Support owning production SLAs.",
      },
      {
        label: "Jira, Linear & Monday With Opinions",
        detail:
          "Enforce tight engineering sprints, a single accountable owner per stage, and strict scope boundaries.",
      },
      {
        label: "Live Customer Readiness",
        detail:
          "Replace manual green checkboxes and spreadsheets with deterministic telemetry from customer staging.",
      },
    ],
    view: "gate1",
    openDrawer: "none",
    placement: "center",
    ctaLabel: "Start Guided Walkthrough",
  },
  {
    id: "mission-bar",
    chapterId: "mission-control",
    chapter: "Mission Control",
    title: "Top Mission Bar & Enterprise Accounts",
    summary:
      "Switch between four realistic enterprise launch scenarios, inspect live probe traffic, reset any account cleanly, or switch between Dark and Light cockpit themes.",
    highlights: [
      {
        label: "4 Enterprise Presets",
        detail:
          "Meridian FinTech, Kestrel Health, Vanguard Retail, and Helios Logistics each keep independent fixes, waivers, drills, and custom YAML.",
      },
      {
        label: "Live Wire Log",
        detail:
          "Chronological stream of every deterministic HTTP probe, patch, waiver, failure test, and sign-off recorded in this session.",
      },
      {
        label: "Reset Scenario & Theme Toggle",
        detail:
          "Restore the active account to factory defaults anytime without losing your tour progress, and toggle Dark (default) or high-contrast Light mode.",
      },
    ],
    targetSelector: '[data-tour="mission-bar"]',
    view: "gate1",
    openDrawer: "none",
    placement: "bottom",
  },
  {
    id: "journey-pipeline",
    chapterId: "mission-control",
    chapter: "Mission Control",
    title: 'Stages 1 to 6 Customer Journey & "The Unverified Gap"',
    summary:
      "Every customer travels from Deal Close (Stage 1) to Renewal (Stage 6). Stages 2 to 4 are The Unverified Gap where NominalX enforces three live gates before production handover.",
    highlights: [
      {
        label: "Numbered Stages & Baton Owners",
        detail:
          "Ownership passes cleanly without ambiguity: Lead SE/SA (Stage 1) -> Lead FDE (Stages 2–3) -> Lead CSE (Stage 4) -> Support (Stage 5).",
      },
      {
        label: "Locked to Live Telemetry",
        detail:
          "LED indicator pips and the Master Verdict pill update directly from probe results — there are no manual status dropdowns to game.",
      },
      {
        label: "Interactive Stage Navigation",
        detail:
          "Click Stages 2–4 to work Gates 1–3, or click Stages 1, 5, or 6 to inspect their pre-gap and post-gap governance charters.",
      },
    ],
    targetSelector: '[data-tour="journey-pipeline"]',
    view: "gate1",
    openDrawer: "none",
    placement: "bottom",
  },
  {
    id: "hero-readiness",
    chapterId: "mission-control",
    chapter: "Mission Control",
    title: "Hero Readiness Band & Hard Stop Lock",
    summary:
      "Your real-time launch verdict rolled up deterministically across all three gates — with an unmistakable Hard Stop Lock whenever a critical security or compliance check fails.",
    highlights: [
      {
        label: "Deterministic Readiness Index",
        detail:
          "Weights Gate 1 (40%), Gate 2 (35%), Gate 3 (20%), and Signed Dossier (5%) into a live verdict: NO-GO, CONDITIONAL GO, or NOMINAL.",
      },
      {
        label: "Non-Waivable Hard Stop Lock",
        detail:
          "When a Hard Stop fails (like Meridian's RESIDENCY check right now), launch and handover stay locked and Readiness is capped at 65% until fixed.",
      },
      {
        label: "Stack-Tailored Context",
        detail:
          "Displays the customer's cloud, IdP, runtime, and P1 alerting stack so every probe assertion and Day-1 runbook matches reality.",
      },
    ],
    targetSelector: '[data-tour="hero-readiness"]',
    view: "gate1",
    openDrawer: "none",
    placement: "bottom",
  },
  {
    id: "sprint-contract",
    chapterId: "governance",
    chapter: "Sprint Governance",
    title: "Sprint Contract Strip & Scope Governance",
    summary:
      "NominalX runs onboarding as focused engineering sprints — never waterfall review committees. Every stage states its exact goal, owner, team pairing, trigger, and exit proof.",
    highlights: [
      {
        label: 'Single Accountable Owner ("Throat to Choke")',
        detail:
          "One named engineer owns moving the stage forward, paired directly with Vendor and Customer engineering counterparts.",
      },
      {
        label: "Entry Trigger & Done-When Proof",
        detail:
          "Explicit prerequisites and measurable telemetry completion criteria prevent handoffs from stalling.",
      },
      {
        label: "Scope & Governance Drawer",
        detail:
          "Click Scope & Governance on the right to inspect strict In-Scope vs. Out-of-Scope boundaries, rosters, and connected integrations.",
      },
    ],
    targetSelector: '[data-tour="sprint-contract"]',
    view: "gate1",
    openDrawer: "none",
    placement: "bottom",
  },
  {
    id: "gate1-stations",
    chapterId: "gate1",
    chapter: "Gate 1 · Flight Check",
    title: "Gate 1 (1 of 3): Flight Check Stations",
    summary:
      "Parallel live staging probes compare what Sales sold in nominalx.yaml against what actually exists in the customer's staging environment across six stations.",
    highlights: [
      {
        label: "Hard Stops (Never Waivable)",
        detail:
          "AUTH / SSO and RESIDENCY enforce non-negotiable security and compliance guarantees — Risk Waivers are permanently blocked.",
      },
      {
        label: "Operational Stations (Max 2 Waivers)",
        detail:
          "WEBHOOKS, QUOTA / RATE, ALERTING, and ROLLBACK allow at most 2 time-boxed Risk Waivers (named owner, <= 30-day expiry, rollback plan).",
      },
      {
        label: "Live Parallel Probe Sweep",
        detail:
          "Click RUN FLIGHT CHECK to re-poll every station sequentially and log fresh HTTP evidence to the Live Wire Log.",
      },
    ],
    targetSelector: '[data-tour="gate1-stations"]',
    view: "gate1",
    openDrawer: "none",
    placement: "top",
  },
  {
    id: "gate1-diff-inspector",
    chapterId: "gate1",
    chapter: "Gate 1 · Flight Check",
    title: "Evidence Diff Inspector & Live Remediation",
    summary:
      "Select any station tile to inspect promised-vs-observed wire evidence, review the exact infrastructure fix diff, and apply a live fix or audited Risk Waiver.",
    highlights: [
      {
        label: "Promised vs. Observed Wire Diff",
        detail:
          "Red DRIFT rows and raw curl headers prove the exact staging mismatch — zero finger-pointing between Sales, FDEs, and customer teams.",
      },
      {
        label: "One-Click Remediation Simulation",
        detail:
          "Inspect the staged config diff and click Apply Staging Fix & Re-Poll to watch live telemetry flip from NO-GO to NOMINAL.",
      },
      {
        label: "Policy-Validated Waiver Issuance",
        detail:
          "On operational stations, issue a bounded Risk Waiver validated live by @nominalx/core; Hard Stops remain locked until fixed.",
      },
    ],
    targetSelector: '[data-tour="gate1-diff-inspector"]',
    view: "gate1",
    openDrawer: "none",
    placement: "top",
  },
  {
    id: "gate2-static-fire",
    chapterId: "gate2",
    chapter: "Gate 2 · Static Fire",
    title: "Gate 2 (2 of 3): Static Fire (Fault Injection)",
    summary:
      "We just switched to Gate 2. Before production traffic turns on, inject seven controlled failure vectors against staging — duplicates, out-of-order events, 429 bursts, timeouts, secret rotations, schema additions, and clock skew.",
    highlights: [
      {
        label: "Corruption Rate & LED Vector Strip",
        detail:
          "Measure exact packet corruption across every scenario alongside the live throughput-vs-error waveform directly below.",
      },
      {
        label: "Resilience Grade (Target: Grade A)",
        detail:
          "Gate 2 stays NO-GO until data corruption reaches 0.0% (Grade A, CLI exit code 0) across every active failure vector.",
      },
      {
        label: "Stage Patches & Re-Fire",
        detail:
          "Toggle realistic handler fixes in the Patch Switchboard and click RE-FIRE TEST STAND to prove zero corruption with an auditable attempt trail.",
      },
    ],
    targetSelector: '[data-tour="gate2-scoreboard"]',
    view: "gate2",
    openDrawer: "none",
    placement: "bottom",
  },
  {
    id: "gate3-crew-drill",
    chapterId: "gate3",
    chapter: "Gate 3 · Crew Drill",
    title: "Gate 3 (3 of 3): Crew Drill (Day-1 Readiness)",
    summary:
      "Now we are in Gate 3. Zero slide decks and zero multiple-choice quizzes — the Lead CSE hands off to Support Engineers and Customer On-Call SREs using timed 90-second live incident drills.",
    highlights: [
      {
        label: "90-Second Live P1 Alarms",
        detail:
          "Inject realistic Day-30 incidents (runaway ingestion storms, expiring SSO certs, dead alert channels) under a real MTTR countdown clock.",
      },
      {
        label: "Telemetry Waveforms & Incident Logs",
        detail:
          "Diagnose root causes directly from live metric charts and streaming error traces instead of passive training docs.",
      },
      {
        label: "Tactile Runbook Remediation",
        detail:
          "Apply real config patches in the Ops Remediation Console and lock 3/3 consecutive green SLA ticks to unlock final dossier sign-off.",
      },
    ],
    targetSelector: '[data-tour="gate3-cockpit"]',
    view: "gate3",
    openDrawer: "none",
    placement: "top",
  },
  {
    id: "reports-hub",
    chapterId: "reports",
    chapter: "Reports & Handover",
    title: "Reporting & Handover Hub (4 Audience Views)",
    summary:
      "One deterministic engine turns live Gate 1–3 telemetry into four tailored handover artifacts — ready to copy to Slack or export as Markdown and JSON in one click.",
    highlights: [
      {
        label: "Signed NOMINAL Dossier & Day-1 Runbook",
        detail:
          "Seals all evidence with a tamper-evident SHA-256 verification digest, multi-party signers, and a stack-tailored Support runbook.",
      },
      {
        label: "Executive Brief & Operational Sprint Digest",
        detail:
          "VP-ready go/no-go summary paired with a Slack-ready engineering standup digest listing remaining blockers and next CLI commands.",
      },
      {
        label: "Waiver Aging Register",
        detail:
          "Tracks every active operational waiver's owner, ticket, rollback plan, and <= 30-day expiry countdown while attesting zero Hard Stop waivers.",
      },
    ],
    targetSelector: '[data-tour="reports-hub-top"]',
    view: "reports",
    openDrawer: "none",
    placement: "bottom",
  },
  {
    id: "customize-yaml",
    chapterId: "customize",
    chapter: "Customize & CLI",
    title: "Live Gate Customizer (nominalx.yaml) & CLI Parity",
    summary:
      "We opened the live Customize drawer on the right. Adapt every gate to any enterprise architecture in the browser with two-way nominalx.yaml sync — identical to the offline nominalx CLI.",
    highlights: [
      {
        label: "Custom Gate 1 Stations & Hard Stops",
        detail:
          "Add custom HTTP, header, or JSON probes — including custom non-waivable Hard Stops like PCI Vault or HSM checks — in one click.",
      },
      {
        label: "Custom Chaos Vectors & Alarms",
        detail:
          "Toggle built-in Gate 2 vectors and Gate 3 drills or author customer-specific failure payloads and 90-second playbooks.",
      },
      {
        label: "2-Way Live YAML & CI Parity",
        detail:
          "Edit, schema-validate, or download nominalx.yaml to commit to Git and run the exact same checks headlessly in CI/CD.",
      },
    ],
    targetSelector: '[data-tour="customize-drawer-sheet"]',
    view: "reports",
    openDrawer: "customize",
    placement: "left",
  },
  {
    id: "contextual-help-launch",
    chapterId: "launch",
    chapter: "Ready to Launch",
    title: "Contextual ? Help & Ready to Launch",
    summary:
      "We closed the drawer and brought you back to Gate 1. Inline ? tooltips sit next to every control across the cockpit, and you can replay this tour anytime from the top bar.",
    highlights: [
      {
        label: "Contextual ? Help Everywhere",
        detail:
          "Hover or click any ? icon to see plain-human explanations of telemetry rules, Hard Stop locks, waiver caps, and runbook commands.",
      },
      {
        label: "Replay This Tour Anytime",
        detail:
          "Click the Tour button highlighted here in the Mission Control bar whenever you want a refresher or a live demo walkthrough.",
      },
      {
        label: "Your First Live Mission",
        detail:
          "Click Finish & Launch below, then fix Meridian FinTech's failing RESIDENCY Hard Stop in Gate 1 to unlock launch!",
      },
    ],
    targetSelector: '[data-tour="tour-replay-wrap"]',
    view: "gate1",
    openDrawer: "none",
    placement: "bottom",
    ctaLabel: "Finish & Launch",
  },
];

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
