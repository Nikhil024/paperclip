import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AdapterSkillContext,
  AdapterSkillSnapshot,
} from "@paperclipai/adapter-utils";
import {
  buildPersistentSkillSnapshot,
  ensurePaperclipSkillSymlink,
  readPaperclipRuntimeSkillEntries,
  readInstalledSkillTargets,
  resolveLegacyPaperclipDesiredSkillNames,
} from "@paperclipai/adapter-utils/server-utils";
import { PI_VARIANT, type PiVariant } from "./variant.js";

const __moduleDir = path.dirname(fileURLToPath(import.meta.url));

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

// Shared with execute.ts so the skills linked at run time and the skills
// snapshot shown in the UI agree: an agent-config PI_CODING_AGENT_DIR wins,
// then an agent-config HOME, then the server user's home.
export function resolvePiSkillsHome(config: Record<string, unknown>, variant: PiVariant) {
  const env =
    typeof config.env === "object" && config.env !== null && !Array.isArray(config.env)
      ? (config.env as Record<string, unknown>)
      : {};
  const configuredAgentDir = asString(env.PI_CODING_AGENT_DIR);
  if (configuredAgentDir) return path.join(path.resolve(configuredAgentDir), "skills");
  const configuredHome = asString(env.HOME);
  const home = configuredHome ? path.resolve(configuredHome) : os.homedir();
  return path.join(home, variant.homeDirName, "agent", "skills");
}

async function buildPiSkillSnapshot(
  config: Record<string, unknown>,
  variant: PiVariant,
): Promise<AdapterSkillSnapshot> {
  const availableEntries = await readPaperclipRuntimeSkillEntries(config, __moduleDir);
  const desiredSkills = resolveLegacyPaperclipDesiredSkillNames(config, availableEntries);
  const skillsHome = resolvePiSkillsHome(config, variant);
  const installed = await readInstalledSkillTargets(skillsHome);
  return buildPersistentSkillSnapshot({
    adapterType: variant.type,
    availableEntries,
    desiredSkills,
    installed,
    skillsHome,
    locationLabel: `~/${variant.homeDirName}/agent/skills`,
    missingDetail: `Configured but not currently linked into the ${variant.label} skills home.`,
    externalConflictDetail: "Skill name is occupied by an external installation.",
    externalDetail: "Installed outside Paperclip management.",
  });
}

export async function listPiSkills(
  ctx: AdapterSkillContext,
  variant: PiVariant = PI_VARIANT,
): Promise<AdapterSkillSnapshot> {
  return buildPiSkillSnapshot(ctx.config, variant);
}

export async function syncPiSkills(
  ctx: AdapterSkillContext,
  desiredSkills: string[],
  variant: PiVariant = PI_VARIANT,
): Promise<AdapterSkillSnapshot> {
  const availableEntries = await readPaperclipRuntimeSkillEntries(ctx.config, __moduleDir);
  const desiredSet = new Set([
    ...resolveLegacyPaperclipDesiredSkillNames({}, availableEntries),
    ...desiredSkills,
  ]);
  const skillsHome = resolvePiSkillsHome(ctx.config, variant);
  await fs.mkdir(skillsHome, { recursive: true });
  const installed = await readInstalledSkillTargets(skillsHome);
  const availableByRuntimeName = new Map(availableEntries.map((entry) => [entry.runtimeName, entry]));

  for (const available of availableEntries) {
    if (!desiredSet.has(available.key)) continue;
    const target = path.join(skillsHome, available.runtimeName);
    await ensurePaperclipSkillSymlink(available.source, target);
  }

  for (const [name, installedEntry] of installed.entries()) {
    const available = availableByRuntimeName.get(name);
    if (!available) continue;
    if (desiredSet.has(available.key)) continue;
    if (installedEntry.targetPath !== available.source) continue;
    await fs.unlink(path.join(skillsHome, name)).catch(() => {});
  }

  return buildPiSkillSnapshot(ctx.config, variant);
}

export function resolvePiDesiredSkillNames(
  config: Record<string, unknown>,
  availableEntries: Array<{ key: string }>,
) {
  return resolveLegacyPaperclipDesiredSkillNames(config, availableEntries);
}
