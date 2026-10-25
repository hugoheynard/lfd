import type { Provider, Type } from "@nestjs/common";

import { DecideOrderShortfallHandler } from "./application/commands/decide-order-shortfall.handler.js";
import { WriteShortfallLetterHandler } from "./application/commands/write-shortfall-letter.handler.js";
import { GetShortfallLetterDraftHandler } from "./application/queries/get-shortfall-letter-draft.handler.js";
import { OrderBillingRepository } from "./domain/ports/order-billing.repository.js";
import { ShortfallDecisionReader } from "./domain/ports/shortfall-decision.reader.js";
import { ShortfallDecisionRepository } from "./domain/ports/shortfall-decision.repository.js";
import { ShortfallLetterReader } from "./domain/ports/shortfall-letter.reader.js";
import { ShortfallNoticeRepository } from "./domain/ports/shortfall-notice.repository.js";
import { AdminOrderShortfallController } from "./http/admin-order-shortfall.controller.js";
import { PrismaOrderBillingRepository } from "./infrastructure/prisma-order-billing.repository.js";
import { PrismaShortfallDecisionReader } from "./infrastructure/prisma-shortfall-decision.reader.js";
import { PrismaShortfallDecisionRepository } from "./infrastructure/prisma-shortfall-decision.repository.js";
import { PrismaShortfallLetterReader } from "./infrastructure/prisma-shortfall-letter.reader.js";
import { PrismaShortfallNoticeRepository } from "./infrastructure/prisma-shortfall-notice.repository.js";

/**
 * Les providers des lots E6b et E6c1 (plan
 * `documentation/commandes/plan-e6-le-depart-incomplet.md`) : la décision du
 * départ incomplet, la décision comme entrée du BL, et le solde de la
 * commande — et, lot E6d, « Écrire au client ». À part du module, qui dépasse déjà la taille d'un fichier. Le
 * guichet du colisage (`ShortfallDesk`) vient de `PackingFeedModule`.
 */
export const ORDER_SHORTFALL_PROVIDERS: readonly Provider[] = [
  DecideOrderShortfallHandler,
  { provide: ShortfallDecisionRepository, useClass: PrismaShortfallDecisionRepository },
  { provide: ShortfallDecisionReader, useClass: PrismaShortfallDecisionReader },
  { provide: OrderBillingRepository, useClass: PrismaOrderBillingRepository },
  WriteShortfallLetterHandler,
  GetShortfallLetterDraftHandler,
  { provide: ShortfallNoticeRepository, useClass: PrismaShortfallNoticeRepository },
  { provide: ShortfallLetterReader, useClass: PrismaShortfallLetterReader },
];

/** Ce que les bons de livraison lisent et écrivent par les ports de la commande. */
export const ORDER_SHORTFALL_EXPORTS = [ShortfallDecisionReader, OrderBillingRepository] as const;

export const ORDER_SHORTFALL_CONTROLLERS: readonly Type[] = [AdminOrderShortfallController];
