import { secretsApi } from "../api/secrets";

export const PROVIDER_ENV_KEYS: Record<string, string> = {
  openrouter: "OPENROUTER_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
  xai: "XAI_API_KEY",
  groq: "GROQ_API_KEY",
  opencode: "OPENCODE_API_KEY",
};

/** Route a Pi provider/model through a custom OpenAI-compatible endpoint via
 * PAPERCLIP_PI_PROVIDERS. The key is referenced as {env:VAR} and expanded
 * server-side; never put a literal key here. */
export function piCustomProviderEnv(
  model: string,
  baseUrl: string,
  apiKeyEnv: string | null,
  contextWindow: number | null = null,
) {
  // Without explicit limits omp borrows a fuzzy-matched catalog entry (often a
  // ~1M window) and requests the remainder as output, which local servers
  // reject. omp's own system prompt + tools is ~37k tokens and it compacts at
  // window - max(15%, 16k), so 64k is the smallest default it runs in.
  const ctx = contextWindow ?? 65536;
  const url = baseUrl.trim();
  const trimmed = model.trim();
  const slash = trimmed.indexOf("/");
  if (!url || slash <= 0 || slash === trimmed.length - 1) return null;
  const provider = trimmed.slice(0, slash);
  const modelId = trimmed.slice(slash + 1);
  return {
    PAPERCLIP_PI_PROVIDERS: {
      type: "plain" as const,
      value: JSON.stringify({
        [provider]: {
          baseUrl: url,
          api: "openai-completions",
          ...(apiKeyEnv ? { apiKey: `{env:${apiKeyEnv}}` } : {}),
          models: [
            {
              id: modelId,
              contextWindow: ctx,
              maxTokens: Math.min(32768, Math.floor(ctx / 4)),
            },
          ],
        },
      }),
    },
  };
}

/** New organization credentials get a distinct key; never rotate another agent's secret. */
export async function storeOrganizationApiKey(
  companyId: string,
  envKey: string,
  value: string,
) {
  const secret = await secretsApi.create(companyId, {
    name: `${envKey} · agent setup`,
    key: `${envKey}.setup.${crypto.randomUUID()}`,
    value: value.trim(),
    description: "Adapter credential supplied during agent setup.",
  });
  return {
    binding: {
      type: "secret_ref" as const,
      secretId: secret.id,
      version: "latest" as const,
    },
    remove: () => secretsApi.remove(secret.id),
  };
}

/** Store a validated key during agent creation without rotating other agents’
 * credentials. The caller removes this definition if creation fails. */
export async function storeProviderApiKey(
  companyId: string,
  envKey: string,
  value: string,
) {
  const key = `${envKey}.setup.${crypto.randomUUID()}`;
  const definition = await secretsApi.createUserSecretDefinition(companyId, {
    key,
    name: `${envKey} · agent setup`,
    description: "Model provider credential for a new agent setup.",
  });
  const remove = () =>
    secretsApi.removeUserSecretDefinition(companyId, definition.id);
  try {
    await secretsApi.createMyUserSecret(companyId, {
      definitionId: definition.id,
      definitionKey: key,
      value: value.trim(),
    });
  } catch (error) {
    await remove();
    throw error;
  }
  return {
    binding: {
      type: "user_secret_ref" as const,
      key,
      version: "latest" as const,
    },
    remove,
  };
}
