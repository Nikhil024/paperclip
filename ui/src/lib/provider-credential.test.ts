import { describe, expect, it } from "vitest";
import { piCustomProviderEnv } from "./provider-credential";

const parse = (env: ReturnType<typeof piCustomProviderEnv>) =>
  JSON.parse(env!.PAPERCLIP_PI_PROVIDERS.value);

describe("piCustomProviderEnv", () => {
  it("builds a Pi provider entry referencing the key env var", () => {
    const env = piCustomProviderEnv(" groq/llama-3 ", " https://x.test/v1 ", "GROQ_API_KEY");
    expect(env?.PAPERCLIP_PI_PROVIDERS.type).toBe("plain");
    expect(parse(env)).toEqual({
      groq: {
        baseUrl: "https://x.test/v1",
        api: "openai-completions",
        apiKey: "{env:GROQ_API_KEY}",
        models: [{ id: "llama-3", contextWindow: 65536, maxTokens: 16384 }],
      },
    });
  });

  it("splits on the first slash only", () => {
    const env = piCustomProviderEnv("tensorix/org/model", "https://x.test/v1", null);
    expect(Object.keys(parse(env))).toEqual(["tensorix"]);
    expect(parse(env).tensorix.models[0].id).toBe("org/model");
  });

  it("returns null for a blank base URL or a model without a provider", () => {
    expect(piCustomProviderEnv("groq/llama-3", "  ", "GROQ_API_KEY")).toBeNull();
    expect(piCustomProviderEnv("llama-3", "https://x.test/v1", null)).toBeNull();
  });

  it("omits apiKey without an env var and never embeds a literal key", () => {
    expect(parse(piCustomProviderEnv("groq/m", "https://x.test/v1", null)).groq).not.toHaveProperty("apiKey");
    const value = piCustomProviderEnv("groq/m", "https://x.test/v1", "GROQ_API_KEY")!.PAPERCLIP_PI_PROVIDERS.value;
    expect(value).not.toMatch(/gsk_|sk-/);
    expect(value).toContain("{env:GROQ_API_KEY}");
  });

  it("derives maxTokens from the given context window, capped at 32768", () => {
    const model = (n: number) =>
      parse(piCustomProviderEnv("spark/q", "https://x.test/v1", null, n)).spark.models[0];
    expect(model(204800)).toEqual({ id: "q", contextWindow: 204800, maxTokens: 32768 });
    expect(model(65536)).toEqual({ id: "q", contextWindow: 65536, maxTokens: 16384 });
    expect(model(10001)).toEqual({ id: "q", contextWindow: 10001, maxTokens: 2500 });
  });
});
