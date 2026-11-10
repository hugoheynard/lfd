import type { Provider, Type } from "@nestjs/common";

import { AbandonCardIncreaseHandler } from "./application/commands/abandon-card-increase.handler.js";
import { ProposeCardIncreaseHandler } from "./application/commands/propose-card-increase.handler.js";
import { ReviseOrderHandler } from "./application/commands/revise-order.handler.js";
import { GetComplementPaymentHandler } from "../application/queries/get-complement-payment.handler.js";
import { GetOrderRevisabilityHandler } from "./application/queries/get-order-revisability.handler.js";
import { ListOrderRevisionsHandler } from "./application/queries/list-order-revisions.handler.js";
import { QuoteOrderChangeRequestHandler } from "../application/queries/quote-order-change-request.handler.js";
import { QuoteOrderRevisionHandler } from "./application/queries/quote-order-revision.handler.js";
import { CardIncreaseAbandonment } from "./application/services/card-increase-abandonment.js";
import { OrderComposition } from "../application/services/order-composition.service.js";
import { OrderCutoffGate } from "../application/services/order-cutoff-gate.service.js";
import { OrderRevisabilityReading } from "./application/services/order-revisability-reading.js";
import { OrderRevising } from "./application/services/order-revising.service.js";
import { RevisionWall } from "./application/services/revision-wall.js";
import { OrderRevisionHistoryReader } from "./domain/ports/order-revision-history.reader.js";
import { OrderRevisionRepository } from "./domain/ports/order-revision.repository.js";
import { RevisableOrderReader } from "./domain/ports/revisable-order.reader.js";
import { AdminOrderComplementController } from "../http/admin-order-complement.controller.js";
import { AdminOrderRevisionsController } from "./http/admin-order-revisions.controller.js";
import { OrderComplementController } from "../http/order-complement.controller.js";
import { OrderRevisionsController } from "./http/order-revisions.controller.js";
import { PrismaOrderRevisionHistoryReader } from "./infrastructure/prisma-order-revision-history.reader.js";
import { PrismaOrderRevisionRepository } from "./infrastructure/prisma-order-revision.repository.js";
import { PrismaRevisableOrderReader } from "./infrastructure/prisma-revisable-order.reader.js";

/**
 * Les providers du lot M1 (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.2 « Le chemin d'une modification ») : la modification
 * d'une commande et son devis, par le client et par l'équipe, la
 * recomposition partagée avec la passation, et leurs deux ports — lire et
 * écrire (ISP). À part du module, qui dépasse déjà la taille d'un fichier.
 *
 * Le guichet du fournil vient de `ProductionDeskFeedModule` ; le recalage de
 * la ligne d'encaissement, de `AccountOrderEngagementModule`.
 *
 * Plus le geste de la hausse payée par carte (doc `modifier-une-commande.md`,
 * §2.7.3) : la demander, relire son complément, l'abandonner. Le dépôt et
 * le lecteur des projets sont déclarés au module, avec le socle (S2.a).
 */
export const ORDER_REVISION_PROVIDERS: readonly Provider[] = [
  OrderComposition,
  OrderCutoffGate,
  OrderRevising,
  RevisionWall,
  ReviseOrderHandler,
  QuoteOrderRevisionHandler,
  QuoteOrderChangeRequestHandler,
  OrderRevisabilityReading,
  GetOrderRevisabilityHandler,
  ListOrderRevisionsHandler,
  CardIncreaseAbandonment,
  ProposeCardIncreaseHandler,
  AbandonCardIncreaseHandler,
  GetComplementPaymentHandler,
  { provide: OrderRevisionHistoryReader, useClass: PrismaOrderRevisionHistoryReader },
  { provide: RevisableOrderReader, useClass: PrismaRevisableOrderReader },
  { provide: OrderRevisionRepository, useClass: PrismaOrderRevisionRepository },
];

export const ORDER_REVISION_CONTROLLERS: readonly Type[] = [
  OrderRevisionsController,
  AdminOrderRevisionsController,
  OrderComplementController,
  AdminOrderComplementController,
];
