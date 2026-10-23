import type { Provider, Type } from "@nestjs/common";

import { ReviseOrderHandler } from "./application/commands/revise-order.handler.js";
import { QuoteOrderRevisionHandler } from "./application/queries/quote-order-revision.handler.js";
import { OrderComposition } from "./application/services/order-composition.service.js";
import { OrderCutoffGate } from "./application/services/order-cutoff-gate.service.js";
import { OrderRevising } from "./application/services/order-revising.service.js";
import { RevisionWall } from "./application/services/revision-wall.js";
import { OrderRevisionRepository } from "./domain/ports/order-revision.repository.js";
import { RevisableOrderReader } from "./domain/ports/revisable-order.reader.js";
import { AdminOrderRevisionsController } from "./http/admin-order-revisions.controller.js";
import { OrderRevisionsController } from "./http/order-revisions.controller.js";
import { PrismaOrderRevisionRepository } from "./infrastructure/prisma-order-revision.repository.js";
import { PrismaRevisableOrderReader } from "./infrastructure/prisma-revisable-order.reader.js";

/**
 * Les providers du lot M1 (plan
 * `documentation/commandes/plan-modifier-une-commande.md`) : la modification
 * d'une commande et son devis, par le client et par l'équipe, la
 * recomposition partagée avec la passation, et leurs deux ports — lire et
 * écrire (ISP). À part du module, qui dépasse déjà la taille d'un fichier.
 *
 * Le guichet du fournil vient de `ProductionDeskFeedModule` ; le recalage de
 * la ligne d'encaissement, de `AccountOrderEngagementModule`.
 */
export const ORDER_REVISION_PROVIDERS: readonly Provider[] = [
  OrderComposition,
  OrderCutoffGate,
  OrderRevising,
  RevisionWall,
  ReviseOrderHandler,
  QuoteOrderRevisionHandler,
  { provide: RevisableOrderReader, useClass: PrismaRevisableOrderReader },
  { provide: OrderRevisionRepository, useClass: PrismaOrderRevisionRepository },
];

export const ORDER_REVISION_CONTROLLERS: readonly Type[] = [
  OrderRevisionsController,
  AdminOrderRevisionsController,
];
