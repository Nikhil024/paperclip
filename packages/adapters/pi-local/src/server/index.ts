import type {
  AdapterEnvironmentTestContext,
  AdapterExecutionContext,
  AdapterSessionCodec,
  AdapterSkillContext,
} from "@paperclipai/adapter-utils";
import { execute } from "./execute.js";
import { listPiModels } from "./models.js";
import { listPiSkills, syncPiSkills } from "./skills.js";
import { testEnvironment } from "./test.js";
import { OMP_VARIANT } from "./variant.js";

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const sessionId =
      readNonEmptyString(record.sessionId) ??
      readNonEmptyString(record.session_id) ??
      readNonEmptyString(record.session);
    if (!sessionId) return null;
    const cwd =
      readNonEmptyString(record.cwd) ??
      readNonEmptyString(record.workdir) ??
      readNonEmptyString(record.folder);
    return {
      sessionId,
      ...(cwd ? { cwd } : {}),
    };
  },
  serialize(params: Record<string, unknown> | null) {
    if (!params) return null;
    const sessionId =
      readNonEmptyString(params.sessionId) ??
      readNonEmptyString(params.session_id) ??
      readNonEmptyString(params.session);
    if (!sessionId) return null;
    const cwd =
      readNonEmptyString(params.cwd) ??
      readNonEmptyString(params.workdir) ??
      readNonEmptyString(params.folder);
    return {
      sessionId,
      ...(cwd ? { cwd } : {}),
    };
  },
  getDisplayId(params: Record<string, unknown> | null) {
    if (!params) return null;
    return (
      readNonEmptyString(params.sessionId) ??
      readNonEmptyString(params.session_id) ??
      readNonEmptyString(params.session)
    );
  },
};

export { execute } from "./execute.js";
export { listPiSkills, syncPiSkills } from "./skills.js";
export { testEnvironment } from "./test.js";
export {
  listPiModels,
  discoverPiModels,
  discoverPiModelsCached,
  ensurePiModelConfiguredAndAvailable,
  resetPiModelsCacheForTests,
} from "./models.js";
export { parsePiJsonl, isPiUnknownSessionError } from "./parse.js";
export { OMP_VARIANT, PI_VARIANT, type PiVariant } from "./variant.js";

// omp_local (Oh My Pi) runs through the same code with the omp variant.
export const ompExecute = (ctx: AdapterExecutionContext) => execute(ctx, OMP_VARIANT);
export const ompTestEnvironment = (ctx: AdapterEnvironmentTestContext) => testEnvironment(ctx, OMP_VARIANT);
export const listOmpSkills = (ctx: AdapterSkillContext) => listPiSkills(ctx, OMP_VARIANT);
export const syncOmpSkills = (ctx: AdapterSkillContext, desiredSkills: string[]) =>
  syncPiSkills(ctx, desiredSkills, OMP_VARIANT);
export const listOmpModels = () => listPiModels(OMP_VARIANT);
