import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import type { NominalXConfig } from "./types.js";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const CUSTOM_STATION_CODE_REGEX = /^[A-Z][A-Z0-9_]{1,39}$/;
const CUSTOM_ID_SLUG_REGEX = /^[a-z][a-z0-9_-]{1,47}$/;

const BUILTIN_STATION_CODES = new Set([
  "AUTH_SSO",
  "RESIDENCY",
  "WEBHOOKS",
  "QUOTA_RATE",
  "ALERTING",
  "ROLLBACK",
]);

const BUILTIN_HARD_STOP_ALIASES = new Set([
  "AUTH_SSO",
  "AUTH / SSO",
  "AUTH/SSO",
  "AUTH",
  "SSO",
  "RESIDENCY",
]);

const BUILTIN_CHAOS_VECTOR_IDS = new Set([
  "duplicate_webhook",
  "out_of_order",
  "rate_limit_429",
  "upstream_timeout_30s",
  "dual_hmac_rotation",
  "additive_json_fields",
  "clock_skew_5m",
]);

const BUILTIN_CREW_ALARM_IDS = new Set([
  "runaway_ingestion_storm",
  "sso_cert_expiring_24h",
  "dead_p1_alert_channel",
]);

const AccountStackSchema = z.object({
  cloud: z.string().min(1, "Stack cloud provider is required"),
  idp: z.string().min(1, "Stack identity provider (IdP) is required"),
  alerting: z.string().min(1, "Stack alerting platform is required"),
  webhook_runtime: z.string().min(1, "Stack webhook runtime is required"),
  deployment_tool: z.string().min(1).optional(),
  observability: z.string().min(1).optional(),
  ticketing: z.string().min(1).optional(),
});

const AccountSchema = z.object({
  id: z
    .string()
    .min(2, "Account id must be at least 2 characters")
    .regex(/^[a-z0-9-]+$/, "Account id must use lowercase kebab-case"),
  name: z.string().min(1, "Account display name is required"),
  industry: z.string().min(1).optional(),
  tier: z.string().min(1).optional(),
  arr_band: z.string().min(1).optional(),
  fde_owner: z.string().min(3, "Single accountable Lead FDE owner is required"),
  cse_owner: z.string().min(3, "Single accountable Lead CSE owner is required"),
  se_owner: z.string().min(3).optional(),
  support_owner: z.string().min(3).optional(),
  tam_owner: z.string().min(3).optional(),
  customer_eng_lead: z
    .string()
    .min(3, "Named Customer Engineering Lead is required"),
  customer_security_lead: z.string().min(3).optional(),
  customer_sre_lead: z.string().min(3).optional(),
  target_go_live: z
    .string()
    .regex(ISO_DATE_REGEX, "target_go_live must be YYYY-MM-DD"),
  stack: AccountStackSchema,
});

const SoldContractSchema = z.object({
  auth: z.object({
    protocol: z.enum(["saml2", "oidc"]),
    mfa_required: z.boolean(),
    min_cert_ttl_days: z.number().int().min(1).max(3650),
    reject_unsigned_assertions: z.boolean().optional().default(true),
  }),
  residency: z.object({
    allowed_regions: z
      .array(z.string().min(2))
      .min(1, "At least one contracted region is required"),
    strict_egress: z.boolean(),
  }),
  webhooks: z.object({
    signing: z.literal("hmac-sha256"),
    dual_secret_rotation: z.boolean(),
    max_clock_skew_seconds: z.number().int().min(30).max(900),
  }),
  quota: z.object({
    guaranteed_rps: z.number().int().positive(),
    require_retry_after_header: z.boolean(),
  }),
  alerting: z.object({
    p1_channel: z.string().min(1, "Contracted P1 alert channel is required"),
    max_ack_ms: z.number().int().positive(),
  }),
  rollback: z.object({
    max_rto_minutes: z.number().positive(),
    dry_run_required: z.boolean(),
  }),
});

const EnvironmentSchema = z.object({
  base_url: z.string().url("environment.base_url must be a valid HTTP/HTTPS URL"),
  endpoints: z.object({
    auth_metadata: z.string().startsWith("/"),
    residency_probe: z.string().startsWith("/"),
    webhook_ingress: z.string().startsWith("/"),
    quota_status: z.string().startsWith("/"),
    alert_sink: z.string().startsWith("/"),
    rollback_check: z.string().startsWith("/"),
  }),
  secrets: z.object({
    webhook_secret_current: z.string().min(1),
    webhook_secret_next: z.string().min(1),
  }),
});

const WaiverInputSchema = z.object({
  station: z.string().min(1, "Waiver station name is required"),
  owner: z.string().min(1, "Waiver named engineering owner is required"),
  reason: z.string().min(1, "Waiver operational reason is required"),
  expires_at: z.string().min(1, "Waiver expiry date (YYYY-MM-DD) is required"),
  rollback_plan: z.string().min(1, "Waiver concrete rollback plan is required"),
  ticket_id: z.string().min(1).optional(),
  issued_at: z.string().regex(ISO_DATE_REGEX).optional(),
});

export const CustomStationSchema = z.object({
  code: z
    .string()
    .regex(
      CUSTOM_STATION_CODE_REGEX,
      "Custom station code must be an uppercase slug (e.g., PCI_VAULT, PCI_TOKEN_VAULT)",
    ),
  label: z.string().min(2, "Custom station label is required"),
  owner: z.string().min(2, "Custom station accountable owner is required"),
  hard_stop: z.boolean().optional().default(false),
  endpoint: z
    .string()
    .startsWith("/", "Custom station endpoint must start with '/'"),
  method: z.enum(["GET", "POST"]).default("GET"),
  expected_status: z.number().int().min(100).max(599).optional().default(200),
  required_header: z
    .object({
      name: z.string().min(1, "required_header.name is required"),
      contains: z.string().min(1, "required_header.contains is required"),
    })
    .optional(),
  required_json_field: z
    .object({
      path: z.string().min(1, "required_json_field.path is required"),
      equals: z.union([z.string(), z.number(), z.boolean()]),
    })
    .optional(),
  sold_promise: z.string().min(3, "Custom station sold_promise is required"),
  initial_status: z.enum(["NOMINAL", "NO_GO"]).optional().default("NO_GO"),
  failure_evidence: z.string().min(1).optional(),
  fix_summary: z.string().min(1).optional(),
});

export const ChaosOverridesSchema = z.object({
  disabled_vectors: z.array(z.string().min(1)).optional().default([]),
});

export const CustomChaosVectorSchema = z.object({
  id: z
    .string()
    .regex(
      CUSTOM_ID_SLUG_REGEX,
      "Custom vector id must use lowercase snake_case or kebab-case",
    ),
  label: z.string().min(2, "Custom vector label is required"),
  description: z.string().min(3, "Custom vector description is required"),
  owner: z.string().min(2, "Custom vector accountable owner is required"),
  endpoint_override: z
    .string()
    .startsWith("/", "endpoint_override must start with '/'")
    .optional(),
  method: z.enum(["GET", "POST", "PUT", "PATCH"]).default("POST"),
  payload: z.record(z.unknown()).optional(),
  expected_status: z.number().int().min(100).max(599),
  weight: z.number().int().min(1).max(200).optional().default(10),
  patch_id: z
    .string()
    .regex(
      CUSTOM_ID_SLUG_REGEX,
      "patch_id must use lowercase snake_case or kebab-case",
    ),
  patch_label: z.string().min(2, "patch_label is required"),
  patch_summary: z.string().min(3, "patch_summary is required"),
  patch_diff: z
    .union([
      z.array(z.string().min(1)).min(1),
      z
        .string()
        .min(1)
        .transform((s) =>
          s
            .split(/\r?\n/)
            .map((l) => l.trimEnd())
            .filter((l) => l.length > 0),
        ),
    ])
    .refine((lines) => lines.length > 0, "patch_diff must include at least one line"),
});

export const CustomAlarmSchema = z.object({
  id: z
    .string()
    .regex(
      CUSTOM_ID_SLUG_REGEX,
      "Custom alarm id must use lowercase snake_case or kebab-case",
    ),
  title: z.string().min(3, "Custom alarm title is required"),
  owner: z.string().min(2, "Custom alarm accountable owner is required"),
  timer_seconds: z.number().int().min(15).max(600).default(90),
  metric_label: z.string().min(2, "Custom alarm metric_label is required"),
  trigger_symptom: z.string().min(3, "Custom alarm trigger_symptom is required"),
  log_lines: z
    .array(z.string().min(1))
    .min(1, "Custom alarm requires at least one log line"),
  remediation_label: z.string().min(3, "remediation_label is required"),
  remediation_detail: z.string().min(3, "remediation_detail is required"),
  verification_proof: z.string().min(3, "verification_proof is required"),
});

export const NominalXConfigSchema = z.object({
  schema_version: z.literal("1.0"),
  account: AccountSchema,
  sold_contract: SoldContractSchema,
  environment: EnvironmentSchema,
  waivers: z.array(WaiverInputSchema).optional().default([]),
  custom_stations: z.array(CustomStationSchema).optional(),
  chaos_overrides: ChaosOverridesSchema.optional(),
  custom_vectors: z.array(CustomChaosVectorSchema).optional(),
  disabled_alarms: z.array(z.string().min(1)).optional(),
  custom_alarms: z.array(CustomAlarmSchema).optional(),
});

export interface ConfigValidationError {
  path: string;
  message: string;
}

export type ConfigValidationResult =
  | { ok: true; config: NominalXConfig }
  | { ok: false; errors: ConfigValidationError[] };

export interface ValidateConfigOptions {
  /**
   * When false (default in parseNominalXConfigYaml), any waiver targeting a
   * built-in Hard Stop (AUTH / SSO, RESIDENCY) or a custom station with
   * hard_stop: true is rejected during config validation.
   */
  allowHardStopWaivers?: boolean;
}

export function validateNominalXConfig(
  raw: unknown,
  options: ValidateConfigOptions = {},
): ConfigValidationResult {
  const parsed = NominalXConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
        message: issue.message,
      })),
    };
  }

  const config: NominalXConfig = parsed.data;
  const errors: ConfigValidationError[] = [];

  // 1. Validate custom_stations uniqueness and built-in collisions
  const customStationCodes = new Set<string>();
  const customHardStopLookup = new Map<string, string>();
  for (let i = 0; i < (config.custom_stations ?? []).length; i += 1) {
    const st = config.custom_stations![i]!;
    if (BUILTIN_STATION_CODES.has(st.code)) {
      errors.push({
        path: `custom_stations.${i}.code`,
        message: `Custom station code "${st.code}" conflicts with a built-in Flight Check station.`,
      });
    } else if (customStationCodes.has(st.code)) {
      errors.push({
        path: `custom_stations.${i}.code`,
        message: `Duplicate custom station code "${st.code}".`,
      });
    } else {
      customStationCodes.add(st.code);
      if (st.hard_stop) {
        customHardStopLookup.set(st.code.toUpperCase(), st.label);
        customHardStopLookup.set(
          st.label.trim().toUpperCase().replace(/\s+/g, " "),
          st.label,
        );
      }
    }
  }

  // 2. Validate chaos_overrides & custom_vectors
  const disabledVectors = config.chaos_overrides?.disabled_vectors ?? [];
  const disabledVectorSet = new Set<string>();
  for (let i = 0; i < disabledVectors.length; i += 1) {
    const vid = disabledVectors[i]!;
    if (!BUILTIN_CHAOS_VECTOR_IDS.has(vid)) {
      errors.push({
        path: `chaos_overrides.disabled_vectors.${i}`,
        message: `Unknown built-in Gate 2 chaos vector "${vid}".`,
      });
    } else {
      disabledVectorSet.add(vid);
    }
  }

  const customVectorIds = new Set<string>();
  for (let i = 0; i < (config.custom_vectors ?? []).length; i += 1) {
    const vec = config.custom_vectors![i]!;
    if (BUILTIN_CHAOS_VECTOR_IDS.has(vec.id)) {
      errors.push({
        path: `custom_vectors.${i}.id`,
        message: `Custom vector id "${vec.id}" conflicts with a built-in Gate 2 vector.`,
      });
    } else if (customVectorIds.has(vec.id)) {
      errors.push({
        path: `custom_vectors.${i}.id`,
        message: `Duplicate custom vector id "${vec.id}".`,
      });
    } else {
      customVectorIds.add(vec.id);
    }
  }

  const remainingVectors =
    BUILTIN_CHAOS_VECTOR_IDS.size -
    disabledVectorSet.size +
    customVectorIds.size;
  if (remainingVectors <= 0) {
    errors.push({
      path: "chaos_overrides.disabled_vectors",
      message:
        "At least 1 Gate 2 chaos vector must remain active (re-enable a built-in vector or add a custom vector).",
    });
  }

  // 3. Validate disabled_alarms & custom_alarms
  const disabledAlarms = config.disabled_alarms ?? [];
  const disabledAlarmSet = new Set<string>();
  for (let i = 0; i < disabledAlarms.length; i += 1) {
    const aid = disabledAlarms[i]!;
    if (!BUILTIN_CREW_ALARM_IDS.has(aid)) {
      errors.push({
        path: `disabled_alarms.${i}`,
        message: `Unknown built-in Gate 3 Crew Drill alarm "${aid}".`,
      });
    } else {
      disabledAlarmSet.add(aid);
    }
  }

  const customAlarmIds = new Set<string>();
  for (let i = 0; i < (config.custom_alarms ?? []).length; i += 1) {
    const alarm = config.custom_alarms![i]!;
    if (BUILTIN_CREW_ALARM_IDS.has(alarm.id)) {
      errors.push({
        path: `custom_alarms.${i}.id`,
        message: `Custom alarm id "${alarm.id}" conflicts with a built-in Gate 3 alarm.`,
      });
    } else if (customAlarmIds.has(alarm.id)) {
      errors.push({
        path: `custom_alarms.${i}.id`,
        message: `Duplicate custom alarm id "${alarm.id}".`,
      });
    } else {
      customAlarmIds.add(alarm.id);
    }
  }

  const remainingAlarms =
    BUILTIN_CREW_ALARM_IDS.size - disabledAlarmSet.size + customAlarmIds.size;
  if (remainingAlarms <= 0) {
    errors.push({
      path: "disabled_alarms",
      message:
        "At least 1 Gate 3 Crew Drill alarm must remain active (re-enable a built-in alarm or add a custom alarm).",
    });
  }

  // 4. Reject waivers targeting built-in or custom Hard Stop stations unless explicitly deferred to Gate 1 audit
  if (!options.allowHardStopWaivers) {
    for (let i = 0; i < (config.waivers ?? []).length; i += 1) {
      const w = config.waivers![i]!;
      const norm = w.station.trim().toUpperCase().replace(/\s+/g, " ");
      if (BUILTIN_HARD_STOP_ALIASES.has(norm)) {
        errors.push({
          path: `waivers.${i}.station`,
          message: `HARD STOP · NON-WAIVABLE: Waivers are strictly forbidden on "${w.station}". Station must pass live telemetry (NOMINAL).`,
        });
      } else if (customHardStopLookup.has(norm)) {
        const label = customHardStopLookup.get(norm)!;
        errors.push({
          path: `waivers.${i}.station`,
          message: `HARD STOP · NON-WAIVABLE: Custom station "${label}" is marked hard_stop: true and cannot carry a waiver.`,
        });
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    config,
  };
}

/**
 * Browser-safe and Node-safe deterministic YAML parser and validator.
 * Rejects invalid schema, duplicate custom IDs, empty gates, and any waiver
 * targeting a built-in or custom Hard Stop station by default.
 */
export function parseNominalXConfigYaml(
  yamlText: string,
  options: ValidateConfigOptions = {},
): ConfigValidationResult {
  try {
    const parsed = parseYaml(yamlText);
    return validateNominalXConfig(parsed, options);
  } catch (err) {
    return {
      ok: false,
      errors: [
        {
          path: "(yaml)",
          message:
            err instanceof Error
              ? `Invalid YAML syntax: ${err.message}`
              : "Invalid YAML syntax",
        },
      ],
    };
  }
}

/**
 * Backward-compatible alias used by CLI `nominalx check` so Gate 1 can emit
 * structured JSON reports containing `waiverAudit.hardStopViolations` with exit code 1.
 */
export function parseNominalXYaml(
  yamlText: string,
  options: ValidateConfigOptions = { allowHardStopWaivers: true },
): ConfigValidationResult {
  return parseNominalXConfigYaml(yamlText, options);
}

/**
 * Browser-safe and Node-safe deterministic YAML serializer for NominalX configs.
 * Strips empty optional customization blocks so standard configs stay concise.
 */
export function serializeNominalXConfigYaml(config: NominalXConfig): string {
  const clean: Record<string, unknown> = {
    schema_version: config.schema_version,
    account: config.account,
    sold_contract: config.sold_contract,
    environment: config.environment,
    waivers: config.waivers ?? [],
  };

  if (config.custom_stations && config.custom_stations.length > 0) {
    clean.custom_stations = config.custom_stations;
  }
  if (
    config.chaos_overrides &&
    config.chaos_overrides.disabled_vectors &&
    config.chaos_overrides.disabled_vectors.length > 0
  ) {
    clean.chaos_overrides = {
      disabled_vectors: config.chaos_overrides.disabled_vectors,
    };
  }
  if (config.custom_vectors && config.custom_vectors.length > 0) {
    clean.custom_vectors = config.custom_vectors;
  }
  if (config.disabled_alarms && config.disabled_alarms.length > 0) {
    clean.disabled_alarms = config.disabled_alarms;
  }
  if (config.custom_alarms && config.custom_alarms.length > 0) {
    clean.custom_alarms = config.custom_alarms;
  }

  return stringifyYaml(clean, {
    indent: 2,
    lineWidth: 100,
  });
}
