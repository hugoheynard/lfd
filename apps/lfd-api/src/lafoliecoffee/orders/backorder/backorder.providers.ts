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
import { BackorderAbandonment } from "./application/backorder-abandonment.js";
import { AbandonBackorderHandler } from "./application/commands/abandon-backorder.handler.js";
import { ListBackordersHandler } from "./application/queries/list-backorders.handler.js";
import { BackorderListReader } from "./domain/ports/backorder-list.reader.js";
import { BackorderOriginNumberReader } from "./domain/ports/backorder-origin-number.reader.js";
import { OrderBackorderReader } from "./domain/ports/order-backorder.reader.js";
import { PrismaBackorderListReader } from "./infrastructure/prisma-backorder-list.reader.js";
import { PrismaBackorderOriginNumberReader } from "./infrastructure/prisma-backorder-origin-number.reader.js";
import { PrismaOrderBackorderReader } from "./infrastructure/prisma-order-backorder.reader.js";

/**
 * Les providers du **reliquat de commande** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`) : le
 * dépôt, l'origine relue sous le verrou de la décision, et la naissance que
 * `ShortfallDeparture` appelle ; le prix d'origine relu pour la
 * transformation, et ses deux cas (transformer, estimer) ; l'abandon, que
 * l'annulation de l'origine partage avec le geste de l'équipe ; la liste, et
 * les reliquats d'une commande pour sa fiche.
 */
export const ORDER_BACKORDER_PROVIDERS: readonly Provider[] = [
  { provide: BackorderRepository, useClass: PrismaBackorderRepository },
  { provide: BackorderOriginReader, useClass: PrismaBackorderOriginReader },
  { provide: BackorderReplayReader, useClass: PrismaBackorderReplayReader },
  BackorderOpening,
  ConvertBackorderHandler,
  QuoteBackorderHandler,
  { provide: BackorderListReader, useClass: PrismaBackorderListReader },
  { provide: OrderBackorderReader, useClass: PrismaOrderBackorderReader },
  { provide: BackorderOriginNumberReader, useClass: PrismaBackorderOriginNumberReader },
  BackorderAbandonment,
  AbandonBackorderHandler,
  ListBackordersHandler,
];

/** Les routes du reliquat, vues de l'équipe. */
export const ORDER_BACKORDER_CONTROLLERS = [AdminBackordersController] as const;
