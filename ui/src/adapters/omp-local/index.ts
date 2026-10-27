import type { UIAdapterModule } from "../types";
import { buildPiLocalConfig, parsePiStdoutLine } from "@paperclipai/adapter-pi-local/ui";
import { PiLocalConfigFields } from "../pi-local/config-fields";

// Oh My Pi (omp) is a Pi fork: same stream format and config fields.
export const ompLocalUIAdapter: UIAdapterModule = {
  type: "omp_local",
  label: "Oh My Pi",
  parseStdoutLine: parsePiStdoutLine,
  ConfigFields: PiLocalConfigFields,
  buildAdapterConfig: buildPiLocalConfig,
};
