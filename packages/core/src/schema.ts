import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { NominalXConfig } from "./types.js";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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

export const NominalXConfigSchema = z.object({
  schema_version: z.literal("1.0"),
  account: AccountSchema,
  sold_contract: SoldContractSchema,
  environment: EnvironmentSchema,
  waivers: z.array(WaiverInputSchema).optional().default([]),
});

export interface ConfigValidationError {
  path: string;
  message: string;
}

export type ConfigValidationResult =
  | { ok: true; config: NominalXConfig }
  | { ok: false; errors: ConfigValidationError[] };

export function validateNominalXConfig(raw: unknown): ConfigValidationResult {
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
  return {
    ok: true,
    config: parsed.data,
  };
}

export function parseNominalXYaml(yamlText: string): ConfigValidationResult {
  try {
    const parsed = parseYaml(yamlText);
    return validateNominalXConfig(parsed);
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
