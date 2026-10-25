import type { Provider, Type } from "@nestjs/common";

import { DecideOrderShortfallHandler } from "./application/commands/decide-order-shortfall.handler.js";
import { OrderBillingRepository } from "./domain/ports/order-billing.repository.js";
import { ShortfallDecisionReader } from "./domain/ports/shortfall-decision.reader.js";
import { ShortfallDecisionRepository } from "./domain/ports/shortfall-decision.repository.js";
import { AdminOrderShortfallController } from "./http/admin-order-shortfall.controller.js";
import { PrismaOrderBillingRepository } from "./infrastructure/prisma-order-billing.repository.js";
import { PrismaShortfallDecisionReader } from "./infrastructure/prisma-shortfall-decision.reader.js";
import { PrismaShortfallDecisionRepository } from "./infrastructure/prisma-shortfall-decision.repository.js";

/**
 * Les providers des lots E6b et E6c1 (plan
 * `documentation/commandes/plan-e6-le-depart-incomplet.md`) : la décision du
 * départ incomplet, la décision comme entrée du BL, et le solde de la
 * commande. À part du module, qui dépasse déjà la taille d'un fichier. Le
 * guichet du colisage (`ShortfallDesk`) vient de `PackingFeedModule`.
 */
export const ORDER_SHORTFALL_PROVIDERS: readonly Provider[] = [
  DecideOrderShortfallHandler,
  { provide: ShortfallDecisionRepository, useClass: PrismaShortfallDecisionRepository },
  { provide: ShortfallDecisionReader, useClass: PrismaShortfallDecisionReader },
  { provide: OrderBillingRepository, useClass: PrismaOrderBillingRepository },
];

/** Ce que les bons de livraison lisent et écrivent par les ports de la commande. */
export const ORDER_SHORTFALL_EXPORTS = [ShortfallDecisionReader, OrderBillingRepository] as const;

export const ORDER_SHORTFALL_CONTROLLERS: readonly Type[] = [AdminOrderShortfallController];
