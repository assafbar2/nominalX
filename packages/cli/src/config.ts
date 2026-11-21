import { readFile } from "node:fs/promises";
import { parseNominalXYaml, type NominalXConfig } from "@nominalx/core";

export const DEMO_SECRET_CURRENT = "whsec_nominalx_demo_current";
export const DEMO_SECRET_NEXT = "whsec_nominalx_demo_next";

export async function loadConfigFile(filePath: string): Promise<NominalXConfig> {
  const raw = await readFile(filePath, "utf8");
  const parsed = parseNominalXYaml(raw);
  if (!parsed.ok) {
    const details = parsed.errors
      .map((e) => `  - ${e.path}: ${e.message}`)
      .join("\n");
    throw new Error(
      `Invalid NominalX contract config (${filePath}):\n${details}`,
    );
  }
  return parsed.config;
}

function isLocalhostUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    return (
      url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname === "::1"
    );
  } catch {
    return false;
  }
}

export function resolveSecretRef(
  ref: string,
  baseUrl: string,
  kind: "current" | "next",
): string {
  if (ref.startsWith("env:")) {
    const envName = ref.slice(4).trim();
    const value = process.env[envName];
    if (value && value.length > 0) {
      return value;
    }
    if (isLocalhostUrl(baseUrl)) {
      return kind === "current" ? DEMO_SECRET_CURRENT : DEMO_SECRET_NEXT;
    }
    throw new Error(
      `Missing required secret environment variable "${envName}" for ${baseUrl}. Export ${envName} before running nominalx.`,
    );
  }
  return ref;
}

export function resolveWebhookSecrets(config: NominalXConfig): {
  current: string;
  next: string;
} {
  return {
    current: resolveSecretRef(
      config.environment.secrets.webhook_secret_current,
      config.environment.base_url,
      "current",
    ),
    next: resolveSecretRef(
      config.environment.secrets.webhook_secret_next,
      config.environment.base_url,
      "next",
    ),
  };
}
