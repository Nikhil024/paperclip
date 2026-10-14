import { describe, expect, it } from "vitest";
import path from "node:path";
import { resolvePiSkillsHome } from "./skills.js";
import { buildPiRunArgs, OMP_VARIANT, PI_VARIANT, resolveOmpSessionFile } from "./variant.js";

const input = {
  systemPrompt: "SYS",
  provider: "spark",
  modelId: "org/qwen",
  thinking: "high",
  sessionFile: "/home/u/.x/paperclips/s.jsonl",
  resumeSession: true,
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

  it("Pi always passes --session, even for a fresh session (open-or-create)", () => {
    const args = buildPiRunArgs(PI_VARIANT, { ...input, resumeSession: false });
    expect(args).toContain("--session");
    expect(args).not.toContain("--session-dir");
  });

  it("omp starts a fresh session with --session-dir, since --session only resumes", () => {
    const args = buildPiRunArgs(OMP_VARIANT, { ...input, resumeSession: false });
    expect(args).not.toContain("--session");
    expect(args.slice(args.indexOf("--session-dir"), args.indexOf("--session-dir") + 2)).toEqual([
      "--session-dir", "/home/u/.x/paperclips",
    ]);
  });

  it("omits optional flags when unset", () => {
    const args = buildPiRunArgs(OMP_VARIANT, { ...input, provider: null, modelId: null, thinking: "", extraArgs: [] });
    expect(args).not.toContain("--provider");
    expect(args).not.toContain("--model");
    expect(args).not.toContain("--thinking");
  });
});

describe("resolveOmpSessionFile", () => {
  // Real first stdout line and resulting file name from omp 18.9.1.
  const stdout =
    '{"type":"session","version":3,"id":"01a13c0b-efd3-74d1-87eb-79791c794d15","timestamp":"2026-10-14T20:12:57.683Z","cwd":"/app"}\n' +
    '{"type":"agent_start"}\n';

  it("derives omp's <timestamp>_<id>.jsonl inside the session dir", () => {
    expect(resolveOmpSessionFile(stdout, "/tmp/s")).toBe(
      path.join("/tmp/s", "2026-10-14T20-12-57-683Z_01a13c0b-efd3-74d1-87eb-79791c794d15.jsonl"),
    );
  });

  it("returns null when omp never opened a session", () => {
    expect(resolveOmpSessionFile("Error: Session not found.\n", "/tmp/s")).toBeNull();
    expect(resolveOmpSessionFile("", "/tmp/s")).toBeNull();
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
