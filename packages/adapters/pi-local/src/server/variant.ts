/**
 * pi_local and omp_local (Oh My Pi, a Pi fork) share this adapter. Everything
 * that differs between the two CLIs lives in this table.
 *
 * Shared as-is: `--mode json` event stream, `-p`, `--append-system-prompt`,
 * `--provider`/`--model`, `--thinking`, and `--session <file>` (omp treats a
 * path as "open or create this session file", same as Pi). Custom providers go
 * in `<PI_CODING_AGENT_DIR>/<modelsFileName>` for both CLIs.
 */
export type PiVariant = {
  type: "pi_local" | "omp_local";
  label: string;
  command: string;
  /** Host env var that overrides the default command for model discovery. */
  commandEnvVar: string;
  /** ~/<homeDirName>/agent is the CLI's default agent dir; paperclips/ holds sessions. */
  homeDirName: string;
  listModelsArgs: string[];
  /** "pi-table": columnar text (stderr on current Pi); "omp-json": {"models":[{selector}]}. */
  modelsOutput: "pi-table" | "omp-json";
  /** Custom-provider file inside the agent dir (omp's models.yml accepts JSON). */
  modelsFileName: string;
  tools: string;
  /**
   * Pi loads skills from an explicit `--skill <dir>`. omp has no equivalent flag
   * (`--skills` only filters by name), so its skills are linked into the skills/
   * dir of the agent dir omp is using and discovered there.
   */
  skillArgs: (skillsDir: string) => string[];
  /** Extra args for the environment-test hello probe. */
  probeArgs: string[];
};

export const PI_VARIANT: PiVariant = {
  type: "pi_local",
  label: "Pi",
  command: "pi",
  commandEnvVar: "PAPERCLIP_PI_COMMAND",
  homeDirName: ".pi",
  listModelsArgs: ["--list-models"],
  modelsOutput: "pi-table",
  modelsFileName: "models.json",
  tools: "read,bash,edit,write,grep,find,ls",
  skillArgs: (skillsDir) => ["--skill", skillsDir],
  probeArgs: [],
};

export const OMP_VARIANT: PiVariant = {
  type: "omp_local",
  label: "Oh My Pi",
  command: "omp",
  commandEnvVar: "PAPERCLIP_OMP_COMMAND",
  homeDirName: ".omp",
  listModelsArgs: ["models", "--json"],
  modelsOutput: "omp-json",
  modelsFileName: "models.yml",
  // omp rejects unknown --tools names; it has no `ls` and calls `find` `glob`.
  tools: "read,bash,edit,write,grep,glob",
  skillArgs: () => [],
  // Keep the probe out of omp's session history.
  probeArgs: ["--no-session"],
};

export function buildPiRunArgs(
  variant: PiVariant,
  input: {
    systemPrompt: string;
    provider: string | null;
    modelId: string | null;
    thinking: string;
    sessionFile: string;
    skillsDir: string;
    extraArgs: string[];
    userPrompt: string;
  },
): string[] {
  return [
    // JSON event stream in non-interactive print mode
    "--mode", "json", "-p",
    "--append-system-prompt", input.systemPrompt,
    ...(input.provider ? ["--provider", input.provider] : []),
    ...(input.modelId ? ["--model", input.modelId] : []),
    ...(input.thinking ? ["--thinking", input.thinking] : []),
    "--tools", variant.tools,
    "--session", input.sessionFile,
    ...variant.skillArgs(input.skillsDir),
    ...input.extraArgs,
    // The user prompt is the last argument
    input.userPrompt,
  ];
}
