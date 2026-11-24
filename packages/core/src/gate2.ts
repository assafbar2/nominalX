import { GATE2_SUB_STAGES } from "./lifecycle.js";
import type {
  BuiltInChaosVectorId,
  ChaosVectorId,
  CustomChaosVectorConfig,
  FireAttemptSummary,
  NominalXConfig,
  ResilienceGrade,
  StaticFireResult,
  StaticFireVectorObservation,
  StaticFireVectorResult,
  TelemetryPoint,
} from "./types.js";

export const CHAOS_VECTOR_ORDER: readonly BuiltInChaosVectorId[] = [
  "duplicate_webhook",
  "out_of_order",
  "rate_limit_429",
  "upstream_timeout_30s",
  "dual_hmac_rotation",
  "additive_json_fields",
  "clock_skew_5m",
];

export interface ResolvedChaosVectorSpec {
  index: number;
  ofTotal: number;
  subStage: string;
  vectorId: ChaosVectorId;
  vectorName: string;
  shortName: string;
  description: string;
  owner: string;
  isCustom: boolean;
  remediationSummary: string;
  customConfig?: CustomChaosVectorConfig;
}

export function resolveActiveChaosVectors(
  config?: Pick<NominalXConfig, "chaos_overrides" | "custom_vectors"> & {
    account?: Pick<NominalXConfig["account"], "fde_owner">;
  },
): ResolvedChaosVectorSpec[] {
  const disabledSet = new Set(config?.chaos_overrides?.disabled_vectors ?? []);
  const defaultOwner = config?.account?.fde_owner ?? "Lead FDE";

  const builtIns: Array<Omit<ResolvedChaosVectorSpec, "index" | "ofTotal" | "subStage">> =
    GATE2_SUB_STAGES.filter((meta) => !disabledSet.has(meta.vectorId)).map(
      (meta) => ({
        vectorId: meta.vectorId,
        vectorName: meta.vectorName,
        shortName: meta.shortName,
        description: meta.goal,
        owner: defaultOwner,
        isCustom: false,
        remediationSummary: meta.remediationSummary,
      }),
    );

  const customSpecs: Array<
    Omit<ResolvedChaosVectorSpec, "index" | "ofTotal" | "subStage">
  > = (config?.custom_vectors ?? []).map((vec) => ({
    vectorId: vec.id,
    vectorName: vec.label,
    shortName: vec.label.length > 24 ? `${vec.label.slice(0, 22)}..` : vec.label,
    description: vec.description,
    owner: vec.owner,
    isCustom: true,
    remediationSummary: vec.patch_summary,
    customConfig: vec,
  }));

  const combined = [...builtIns, ...customSpecs];
  const total = combined.length;
  return combined.map((item, idx) => ({
    ...item,
    index: idx + 1,
    ofTotal: total,
    subStage: `${idx + 1} of ${total}`,
  }));
}

export function calculateResilienceGrade(
  corruptionPct: number,
  allVectorsPassed: boolean,
): ResilienceGrade {
  if (corruptionPct === 0 && allVectorsPassed) return "A";
  if (corruptionPct <= 2.0) return "B";
  if (corruptionPct <= 8.0) return "C";
  if (corruptionPct <= 20.0) return "D";
  return "F";
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildDeterministicTelemetrySeries(
  vectors: readonly StaticFireVectorResult[],
  overallCorruptionPct: number,
): TelemetryPoint[] {
  const totalTicks = 24;
  const avgLatency =
    vectors.reduce((acc, v) => acc + v.p95LatencyMs, 0) /
    Math.max(1, vectors.length);
  const failedCount = vectors.filter((v) => !v.passed).length;

  const series: TelemetryPoint[] = [];
  for (let tick = 0; tick < totalTicks; tick += 1) {
    const envelope =
      tick < 4
        ? (tick + 1) / 4
        : tick > 19
          ? Math.max(0.25, (totalTicks - tick) / 5)
          : 1.0;

    const activeVector =
      vectors.length > 0 ? vectors[tick % vectors.length]! : undefined;
    const vectorFactor = activeVector?.passed ? 0.12 : 1.35;
    const wave = 1 + 0.14 * Math.sin((tick + 1) * 1.15);

    const packetsPerSec = Math.round(420 * envelope * wave);
    const corruptionRatePct =
      overallCorruptionPct === 0
        ? 0
        : roundToOneDecimal(
            Math.min(
              100,
              overallCorruptionPct * envelope * (0.75 + 0.35 * vectorFactor),
            ),
          );
    const errorRatePct =
      failedCount === 0
        ? 0
        : roundToOneDecimal(
            Math.min(
              100,
              corruptionRatePct * 1.15 + (activeVector?.passed ? 0 : 4.2),
            ),
          );
    const p95LatencyMs = Math.round(
      avgLatency *
        (0.85 + 0.25 * envelope) *
        (activeVector?.passed ? 0.9 : 1.3),
    );

    series.push({
      tick,
      timeOffsetSec: tick * 2,
      packetsPerSec,
      errorRatePct,
      corruptionRatePct,
      p95LatencyMs,
    });
  }
  return series;
}

export interface ScoreStaticFireInput {
  accountId: string;
  accountName: string;
  targetUrl: string;
  accountableOwner: string;
  observations: readonly StaticFireVectorObservation[];
  config?: Pick<NominalXConfig, "chaos_overrides" | "custom_vectors"> & {
    account?: Pick<NominalXConfig["account"], "fde_owner">;
  };
  activeVectors?: readonly ResolvedChaosVectorSpec[];
  attemptNumber?: number;
  patchesApplied?: readonly string[];
  previousAttempts?: readonly FireAttemptSummary[];
  executedAt?: string;
}

export function scoreStaticFire(input: ScoreStaticFireInput): StaticFireResult {
  const executedAt = input.executedAt ?? new Date().toISOString();
  const obsById = new Map<ChaosVectorId, StaticFireVectorObservation>();
  for (const obs of input.observations) {
    obsById.set(obs.vectorId, obs);
  }

  const activeSpecs =
    input.activeVectors ?? resolveActiveChaosVectors(input.config);

  const vectors: StaticFireVectorResult[] = activeSpecs.map((meta) => {
    const obs = obsById.get(meta.vectorId);
    if (!obs) {
      throw new Error(
        `Missing Static Fire vector observation for "${meta.vectorId}" (${meta.subStage})`,
      );
    }
    const corruptionPct =
      obs.packetsSent > 0
        ? roundToOneDecimal((obs.packetsCorrupted / obs.packetsSent) * 100)
        : obs.passed
          ? 0
          : 100;

    return {
      ...obs,
      index: meta.index,
      subStage: meta.subStage,
      vectorName: meta.vectorName,
      shortName: meta.shortName,
      isCustom: meta.isCustom || undefined,
      corruptionPct,
      accountableOwner: meta.isCustom ? meta.owner : input.accountableOwner,
      remediationSummary: meta.remediationSummary,
    };
  });

  const packetsSent = vectors.reduce((sum, v) => sum + v.packetsSent, 0);
  const packetsCorrupted = vectors.reduce(
    (sum, v) => sum + v.packetsCorrupted,
    0,
  );
  const packetsDropped = vectors.reduce((sum, v) => sum + v.packetsDropped, 0);
  const passedVectors = vectors.filter((v) => v.passed).length;
  const failedVectors = vectors.length - passedVectors;
  const totalVectors = vectors.length;

  const corruptionPct =
    packetsSent > 0
      ? roundToOneDecimal((packetsCorrupted / packetsSent) * 100)
      : failedVectors === 0
        ? 0
        : 100;

  const allVectorsPassed = totalVectors > 0 && failedVectors === 0;
  const grade = calculateResilienceGrade(corruptionPct, allVectorsPassed);
  const passed = corruptionPct === 0 && allVectorsPassed;

  const previousAttempts = [...(input.previousAttempts ?? [])];
  const attemptNumber = input.attemptNumber ?? previousAttempts.length + 1;
  const patchesApplied = [...(input.patchesApplied ?? [])];

  const currentSummary: FireAttemptSummary = {
    attemptNumber,
    executedAt,
    corruptionPct,
    grade,
    passedVectors,
    totalVectors,
    patchesApplied,
  };

  const attemptHistory: FireAttemptSummary[] = [
    ...previousAttempts.filter((a) => a.attemptNumber !== attemptNumber),
    currentSummary,
  ].sort((a, b) => a.attemptNumber - b.attemptNumber);

  const telemetrySeries = buildDeterministicTelemetrySeries(
    vectors,
    corruptionPct,
  );

  return {
    gateNumber: 2,
    gateLabel: "Gate 2: Static Fire · Fault Injection",
    stageNumber: 3,
    stageLabel: "Integration & Cutover",
    accountId: input.accountId,
    accountName: input.accountName,
    targetUrl: input.targetUrl,
    executedAt,
    accountableOwner: input.accountableOwner,
    attemptNumber,
    patchesApplied,
    vectors,
    totals: {
      packetsSent,
      packetsCorrupted,
      packetsDropped,
      passedVectors,
      failedVectors,
      totalVectors,
    },
    corruptionPct,
    grade,
    passed,
    exitCode: passed ? 0 : 1,
    telemetrySeries,
    attemptHistory,
  };
}
