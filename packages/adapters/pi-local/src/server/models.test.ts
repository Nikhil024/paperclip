import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensurePiModelConfiguredAndAvailable,
  listPiModels,
  parseOmpModelsJson,
  resetPiModelsCacheForTests,
} from "./models.js";
import { OMP_VARIANT } from "./variant.js";

describe("pi models", () => {
  afterEach(() => {
    delete process.env.PAPERCLIP_PI_COMMAND;
    resetPiModelsCacheForTests();
  });

  it("returns an empty list when discovery command is unavailable", async () => {
    process.env.PAPERCLIP_PI_COMMAND = "__paperclip_missing_pi_command__";
    await expect(listPiModels()).resolves.toEqual([]);
  });

  it("rejects when model is missing", async () => {
    await expect(
      ensurePiModelConfiguredAndAvailable({ model: "" }),
    ).rejects.toThrow("Pi requires `adapterConfig.model`");
  });

  it("rejects when discovery cannot run for configured model", async () => {
    process.env.PAPERCLIP_PI_COMMAND = "__paperclip_missing_pi_command__";
    await expect(
      ensurePiModelConfiguredAndAvailable({
        model: "xai/grok-4",
      }),
    ).rejects.toThrow();
  });

  it("does not embed the model catalogue when the configured model is unavailable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "paperclip-pi-models-"));
    const command = join(directory, "pi");
    const modelIds = Array.from({ length: 13 }, (_, index) => `provider/model-${index}`);
    await writeFile(
      command,
      `#!/bin/sh\nprintf 'provider  model\\n';\n${modelIds
        .map((id) => {
          const [provider, model] = id.split("/");
          return `printf '${provider}  ${model}\\n'`;
        })
        .join(";\n")}\n`,
    );
    await chmod(command, 0o755);

    try {
      await expect(
        ensurePiModelConfiguredAndAvailable({
          command,
          model: "provider/missing",
        }),
      ).rejects.toMatchObject({
        message:
          "Configured Pi model is unavailable: provider/missing. 13 models are available; list them with `pi --list-models`.",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("names the omp variant in errors", async () => {
    await expect(
      ensurePiModelConfiguredAndAvailable({ model: "", variant: OMP_VARIANT }),
    ).rejects.toThrow("Oh My Pi requires `adapterConfig.model`");
  });
});

describe("parseOmpModelsJson", () => {
  it("reads selectors from `omp models --json`", () => {
    const stdout = JSON.stringify({
      models: [
        { provider: "spark", id: "qwen3.8-flash-next", selector: "spark/qwen3.8-flash-next" },
        { provider: "openrouter", id: "org/model" },
        { provider: "broken" },
      ],
    });
    expect(parseOmpModelsJson(stdout)).toEqual([
      { id: "spark/qwen3.8-flash-next", label: "spark/qwen3.8-flash-next" },
      { id: "openrouter/org/model", label: "openrouter/org/model" },
    ]);
  });

  it("returns [] for non-JSON output", () => {
    expect(parseOmpModelsJson("provider  model")).toEqual([]);
  });
});
