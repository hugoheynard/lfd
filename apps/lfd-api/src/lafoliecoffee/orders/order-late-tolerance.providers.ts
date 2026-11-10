import type { Provider } from "@nestjs/common";

import { GetCounterLateToleranceHandler } from "./application/queries/get-counter-late-tolerance.handler.js";
import { LateToleranceReader } from "./domain/ports/late-tolerance.reader.js";
import { SettingsLateToleranceReader } from "./infrastructure/settings-late-tolerance.reader.js";

/**
 * Les providers de **la tolérance de retard** (Hugo, 2026-11-03) : son port,
 * lu par la Supervision et le comptoir, et la lecture du comptoir. À part du
 * module, qui dépasse déjà la taille d'un fichier.
 */
export const ORDER_LATE_TOLERANCE_PROVIDERS: readonly Provider[] = [
  GetCounterLateToleranceHandler,
  { provide: LateToleranceReader, useClass: SettingsLateToleranceReader },
];
