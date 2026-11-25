import type { Provider } from "@nestjs/common";

import { BackorderOpening } from "./application/backorder-opening.js";
import { BackorderOriginReader } from "./domain/ports/backorder-origin.reader.js";
import { BackorderRepository } from "./domain/ports/backorder.repository.js";
import { PrismaBackorderOriginReader } from "./infrastructure/prisma-backorder-origin.reader.js";
import { PrismaBackorderRepository } from "./infrastructure/prisma-backorder.repository.js";
import { BackorderReplayReader } from "./domain/ports/backorder-replay.reader.js";
import { PrismaBackorderReplayReader } from "./infrastructure/prisma-backorder-replay.reader.js";
import { ConvertBackorderHandler } from "./application/commands/convert-backorder.handler.js";
import { QuoteBackorderHandler } from "./application/queries/quote-backorder.handler.js";
import { AdminBackordersController } from "./http/admin-backorders.controller.js";

/**
 * Les providers du **reliquat de commande** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`) : le
 * dépôt, l'origine relue sous le verrou de la décision, et la naissance que
 * `ShortfallDeparture` appelle ; le prix d'origine relu pour la
 * transformation, et ses deux cas (transformer, estimer).
 */
export const ORDER_BACKORDER_PROVIDERS: readonly Provider[] = [
  { provide: BackorderRepository, useClass: PrismaBackorderRepository },
  { provide: BackorderOriginReader, useClass: PrismaBackorderOriginReader },
  { provide: BackorderReplayReader, useClass: PrismaBackorderReplayReader },
  BackorderOpening,
  ConvertBackorderHandler,
  QuoteBackorderHandler,
];

/** Les routes du reliquat, vues de l'équipe. */
export const ORDER_BACKORDER_CONTROLLERS = [AdminBackordersController] as const;
