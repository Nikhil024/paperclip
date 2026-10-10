import { describe, expect, it } from "vitest";
import path from "node:path";
import { resolvePiSkillsHome } from "./skills.js";
import { buildPiRunArgs, OMP_VARIANT, PI_VARIANT } from "./variant.js";

const input = {
  systemPrompt: "SYS",
  provider: "spark",
  modelId: "org/qwen",
  thinking: "high",
  sessionFile: "/home/u/.x/paperclips/s.jsonl",
  skillsDir: "/home/u/.x/agent/skills",
  extraArgs: ["--verbose"],
  userPrompt: "do it",
};

describe("buildPiRunArgs", () => {
  it("builds Pi args with --skill and Pi's tool names", () => {
    expect(buildPiRunArgs(PI_VARIANT, input)).toEqual([
      "--mode", "json", "-p",
      "--append-system-prompt", "SYS",
      "--provider", "spark",
      "--model", "org/qwen",
      "--thinking", "high",
      "--tools", "read,bash,edit,write,grep,find,ls",
      "--session", "/home/u/.x/paperclips/s.jsonl",
      "--skill", "/home/u/.x/agent/skills",
      "--verbose",
      "do it",
    ]);
  });

  it("builds omp args: same session/model flags, omp tool names, no skill flag", () => {
    const args = buildPiRunArgs(OMP_VARIANT, input);
    expect(args).not.toContain("--skill");
    expect(args).not.toContain("--skills");
    expect(args.slice(args.indexOf("--tools"), args.indexOf("--tools") + 2)).toEqual([
      "--tools", "read,bash,edit,write,grep,glob",
    ]);
    expect(args.slice(args.indexOf("--session"), args.indexOf("--session") + 2)).toEqual([
      "--session", "/home/u/.x/paperclips/s.jsonl",
    ]);
    expect(args.slice(args.indexOf("--provider"), args.indexOf("--provider") + 4)).toEqual([
      "--provider", "spark", "--model", "org/qwen",
    ]);
    expect(args.at(-1)).toBe("do it");
  });

  it("omits optional flags when unset", () => {
    const args = buildPiRunArgs(OMP_VARIANT, { ...input, provider: null, modelId: null, thinking: "", extraArgs: [] });
    expect(args).not.toContain("--provider");
    expect(args).not.toContain("--model");
    expect(args).not.toContain("--thinking");
  });
});

describe("variant table", () => {
  it("lists models and names provider files per CLI", () => {
    expect(PI_VARIANT.listModelsArgs).toEqual(["--list-models"]);
    expect(OMP_VARIANT.listModelsArgs).toEqual(["models", "--json"]);
    expect(PI_VARIANT.modelsFileName).toBe("models.json");
    expect(OMP_VARIANT.modelsFileName).toBe("models.yml");
  });
});

describe("resolvePiSkillsHome", () => {
  it("prefers agent-config PI_CODING_AGENT_DIR, then HOME, per variant", () => {
    const home = path.resolve("/h");
    expect(resolvePiSkillsHome({ env: { HOME: home } }, OMP_VARIANT)).toBe(path.join(home, ".omp", "agent", "skills"));
    expect(resolvePiSkillsHome({ env: { HOME: home } }, PI_VARIANT)).toBe(path.join(home, ".pi", "agent", "skills"));
    expect(resolvePiSkillsHome({ env: { HOME: home, PI_CODING_AGENT_DIR: "/a" } }, OMP_VARIANT)).toBe(
      path.join(path.resolve("/a"), "skills"),
    );
  });
});
