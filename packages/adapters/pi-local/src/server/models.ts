import { createHash } from "node:crypto";
import type { AdapterModel } from "@paperclipai/adapter-utils";
import { asString, runChildProcess } from "@paperclipai/adapter-utils/server-utils";
import { PI_VARIANT, type PiVariant } from "./variant.js";

const MODELS_CACHE_TTL_MS = 60_000;

function firstNonEmptyLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

function parseModelsOutput(stdout: string): AdapterModel[] {
  const parsed: AdapterModel[] = [];
  const lines = stdout.split(/\r?\n/);
  
  // Skip header line if present
  let startIndex = 0;
  if (lines.length > 0 && (lines[0].includes("provider") || lines[0].includes("model"))) {
    startIndex = 1;
  }
  
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse format: "provider   model   context  max-out  thinking  images"
    // Split by 2+ spaces to handle the columnar format
    const parts = line.split(/\s{2,}/);
    if (parts.length < 2) continue;
    
    const provider = parts[0].trim();
    const model = parts[1].trim();
    
    if (!provider || !model) continue;
    if (provider === "provider" && model === "model") continue; // Skip header
    
    const id = `${provider}/${model}`;
    parsed.push({ id, label: id });
  }
  
  return parsed;
}

// `omp models --json` prints {"models":[{"provider","id","selector",...}]}.
export function parseOmpModelsJson(stdout: string): AdapterModel[] {
  let payload: unknown;
  try {
    payload = JSON.parse(stdout);
  } catch {
    return [];
  }
  const models = (payload as { models?: unknown } | null)?.models;
  if (!Array.isArray(models)) return [];
  return models.flatMap((entry: Record<string, unknown>) => {
    const id =
      typeof entry.selector === "string" && entry.selector.includes("/")
        ? entry.selector
        : typeof entry.provider === "string" && typeof entry.id === "string"
          ? `${entry.provider}/${entry.id}`
          : "";
    return id ? [{ id, label: id }] : [];
  });
}

function dedupeModels(models: AdapterModel[]): AdapterModel[] {
  const seen = new Set<string>();
  const deduped: AdapterModel[] = [];
  for (const model of models) {
    const id = model.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push({ id, label: model.label.trim() || id });
  }
  return deduped;
}

function sortModels(models: AdapterModel[]): AdapterModel[] {
  return [...models].sort((a, b) =>
    a.id.localeCompare(b.id, "en", { numeric: true, sensitivity: "base" }),
  );
}

function resolvePiCommand(input: unknown, variant: PiVariant): string {
  const override = process.env[variant.commandEnvVar];
  const envOverride =
    typeof override === "string" && override.trim().length > 0
      ? override.trim()
      : variant.command;
  return asString(input, envOverride);
}

const discoveryCache = new Map<string, { expiresAt: number; models: AdapterModel[] }>();
const VOLATILE_ENV_KEY_PREFIXES = ["PAPERCLIP_", "npm_", "NPM_"] as const;
const VOLATILE_ENV_KEY_EXACT = new Set(["PWD", "OLDPWD", "SHLVL", "_", "TERM_SESSION_ID"]);

function isVolatileEnvKey(key: string): boolean {
  if (VOLATILE_ENV_KEY_EXACT.has(key)) return true;
  return VOLATILE_ENV_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function discoveryCacheKey(command: string, cwd: string, env: Record<string, string>) {
  const envKey = Object.entries(env)
    .filter(([key]) => !isVolatileEnvKey(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${hashValue(value)}`)
    .join("\n");
  return `${command}\n${cwd}\n${envKey}`;
}

function pruneExpiredDiscoveryCache(now: number) {
  for (const [key, value] of discoveryCache.entries()) {
    if (value.expiresAt <= now) discoveryCache.delete(key);
  }
}

export async function discoverPiModels(input: {
  command?: unknown;
  cwd?: unknown;
  env?: unknown;
  variant?: PiVariant;
} = {}): Promise<AdapterModel[]> {
  const variant = input.variant ?? PI_VARIANT;
  const command = resolvePiCommand(input.command, variant);
  const listing = `${variant.command} ${variant.listModelsArgs.join(" ")}`;
  const cwd = asString(input.cwd, process.cwd());
  const env = normalizeEnv(input.env);
  const runtimeEnv = normalizeEnv({ ...process.env, ...env });

  const result = await runChildProcess(
    `pi-models-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    command,
    variant.listModelsArgs,
    {
      cwd,
      env: runtimeEnv,
      timeoutSec: 20,
      graceSec: 3,
      onLog: async () => {},
    },
  );

  if (result.timedOut) {
    throw new Error(`\`${listing}\` timed out.`);
  }
  if ((result.exitCode ?? 1) !== 0) {
    const detail = firstNonEmptyLine(result.stderr) || firstNonEmptyLine(result.stdout);
    throw new Error(detail ? `\`${listing}\` failed: ${detail}` : `\`${listing}\` failed.`);
  }

  if (variant.modelsOutput === "omp-json") {
    return sortModels(dedupeModels(parseOmpModelsJson(result.stdout)));
  }
  // Pi outputs model list to stderr, but fall back to stdout for older versions
  const output = result.stderr || result.stdout;
  return sortModels(dedupeModels(parseModelsOutput(output)));
}

function normalizeEnv(input: unknown): Record<string, string> {
  const envInput = typeof input === "object" && input !== null && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(envInput)) {
    if (typeof value === "string") env[key] = value;
  }
  return env;
}

export async function discoverPiModelsCached(input: {
  command?: unknown;
  cwd?: unknown;
  env?: unknown;
  variant?: PiVariant;
} = {}): Promise<AdapterModel[]> {
  const variant = input.variant ?? PI_VARIANT;
  const command = resolvePiCommand(input.command, variant);
  const cwd = asString(input.cwd, process.cwd());
  const env = normalizeEnv(input.env);
  const key = discoveryCacheKey(command, cwd, env);
  const now = Date.now();
  pruneExpiredDiscoveryCache(now);
  const cached = discoveryCache.get(key);
  if (cached && cached.expiresAt > now) return cached.models;

  const models = await discoverPiModels({ command, cwd, env, variant });
  discoveryCache.set(key, { expiresAt: now + MODELS_CACHE_TTL_MS, models });
  return models;
}

export async function ensurePiModelConfiguredAndAvailable(input: {
  model?: unknown;
  command?: unknown;
  cwd?: unknown;
  env?: unknown;
  variant?: PiVariant;
}): Promise<AdapterModel[]> {
  const variant = input.variant ?? PI_VARIANT;
  const model = asString(input.model, "").trim();
  if (!model) {
    throw new Error(`${variant.label} requires \`adapterConfig.model\` in provider/model format.`);
  }

  const models = await discoverPiModelsCached({
    command: input.command,
    cwd: input.cwd,
    env: input.env,
    variant,
  });

  if (models.length === 0) {
    throw new Error(
      `${variant.label} returned no models. Run \`${variant.command} ${variant.listModelsArgs.join(" ")}\` and verify provider auth.`,
    );
  }

  if (!models.some((entry) => entry.id === model)) {
    throw new Error(
      `Configured ${variant.label} model is unavailable: ${model}. ${models.length} models are available; list them with \`${variant.command} ${variant.listModelsArgs.join(" ")}\`.`,
    );
  }

  return models;
}

export async function listPiModels(variant: PiVariant = PI_VARIANT): Promise<AdapterModel[]> {
  try {
    return await discoverPiModelsCached({ variant });
  } catch {
    return [];
  }
}

export function resetPiModelsCacheForTests() {
  discoveryCache.clear();
}
