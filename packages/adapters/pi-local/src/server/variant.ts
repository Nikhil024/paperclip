import path from "node:path";

/**
 * pi_local and omp_local (Oh My Pi, a Pi fork) share this adapter. Everything
 * that differs between the two CLIs lives in this table.
 *
 * Shared as-is: `--mode json` event stream, `-p`, `--append-system-prompt`,
 * `--provider`/`--model`, `--thinking`, and `--session <file>` to resume.
 * Custom providers go in `<PI_CODING_AGENT_DIR>/<modelsFileName>` for both.
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
   * How a run that is NOT resuming gets its session file.
   * "session-path": `--session <file>` opens or creates; Paperclip pre-creates
   * the file at its own path (Pi). "session-dir": `--session <file>` only
   * resumes (omp >= 18.9 fails with "not found" / "holds no entries"), so a
   * fresh run passes `--session-dir <dir>` and omp names the file itself; see
   * resolveOmpSessionFile.
   */
  freshSession: "session-path" | "session-dir";
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
  freshSession: "session-path",
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
  freshSession: "session-dir",
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
    /** false = this run starts a new session (see PiVariant.freshSession). */
    resumeSession: boolean;
    skillsDir: string;
    extraArgs: string[];
    userPrompt: string;
  },
): string[] {
  const sessionArgs =
    variant.freshSession === "session-dir" && !input.resumeSession
      ? ["--session-dir", path.dirname(input.sessionFile)]
      : ["--session", input.sessionFile];
  return [
    // JSON event stream in non-interactive print mode
    "--mode", "json", "-p",
    "--append-system-prompt", input.systemPrompt,
    ...(input.provider ? ["--provider", input.provider] : []),
    ...(input.modelId ? ["--model", input.modelId] : []),
    ...(input.thinking ? ["--thinking", input.thinking] : []),
    "--tools", variant.tools,
    ...sessionArgs,
    ...variant.skillArgs(input.skillsDir),
    ...input.extraArgs,
    // The user prompt is the last argument
    input.userPrompt,
  ];
}

/**
 * omp names a fresh session `<timestamp>_<id>.jsonl` inside `--session-dir`,
 * with `:` and `.` in the ISO timestamp replaced by `-`, and announces both in
 * its first stdout event: {"type":"session","id":...,"timestamp":...}.
 * Returns null when no such event was emitted (omp died before opening one).
 */
export function resolveOmpSessionFile(stdout: string, sessionDir: string): string | null {
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith("{")) continue;
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      if (event.type !== "session") continue;
      if (typeof event.id !== "string" || typeof event.timestamp !== "string") return null;
      return path.join(sessionDir, `${event.timestamp.replace(/[:.]/g, "-")}_${event.id}.jsonl`);
    } catch {
      continue;
    }
  }
  return null;
}
