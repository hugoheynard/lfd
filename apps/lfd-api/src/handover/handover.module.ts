import { Module } from "@nestjs/common";

import { ConfirmHandoverHandler } from "./application/commands/confirm-handover.handler.js";
import { ConfirmManualHandoverHandler } from "./application/commands/confirm-manual-handover.handler.js";
import { GetDeliveryRunSheetHandler } from "./application/queries/get-delivery-run-sheet.handler.js";
import { GetHandoverByOrderHandler } from "./application/queries/get-handover-by-order.handler.js";
import { GetHandoverQueueHandler } from "./application/queries/get-handover-queue.handler.js";
import { GetHandoverHandler } from "./application/queries/get-handover.handler.js";
import { HandoverAttestation } from "./application/services/handover-attestation.service.js";
import { HandoverDepartedOrders } from "./application/services/handover-departed-orders.js";
import { HandoverDepartureHolds } from "./application/services/handover-departure-holds.js";
import { HandoverDoorstepAttestor } from "./application/services/handover-doorstep-attestor.js";
import { HandoverAttestationsReader } from "./domain/ports/handover-attestations.reader.js";
import { HandoverProofRepository } from "./domain/ports/handover-proof.repository.js";
import { OrderDepartureRepository } from "./domain/ports/order-departure.repository.js";
import { OrderHandoverRepository } from "./domain/ports/order-handover.repository.js";
import { DeliveryRunSheetController } from "./http/delivery-run-sheet.controller.js";
import { HandoverController } from "./http/handover.controller.js";
import { HandoverSupervisionController } from "./http/handover-supervision.controller.js";
import { PrismaHandoverAttestationsReader } from "./infrastructure/prisma-handover-attestations.reader.js";
import { PrismaHandoverProofRepository } from "./infrastructure/prisma-handover-proof.repository.js";
import { PrismaOrderDepartureRepository } from "./infrastructure/prisma-order-departure.repository.js";
import { PrismaOrderHandoverRepository } from "./infrastructure/prisma-order-handover.repository.js";

/**
 * **Le retrait.**
 *
 * Il ne déclare PAS `HandoverSubjectReader` : c'est le port qu'il publie et
 * que le commerce implémente, relié dans la racine de composition. Le brancher
 * ici obligerait ce module à connaître `b2b`, ce que la matrice interdit — et ce
 * serait franchir la frontière par la porte de service.
 *
 * ⚠️ Il ne déclare pas non plus `AttestedHandoversReader`, pour la raison
 * INVERSE : ce port-là est déclaré par la **production**, et c'est le retrait qui
 * l'implémente. L'adaptateur est donc fourni ailleurs, dans le module de
 * composition qui relie les deux — un contexte ne s'enregistre pas lui-même
 * comme implémentation du port d'un autre.
 *
 * `HandoverDepartureHolds` et `HandoverDepartedOrders` (2026-10-01, BQ), puis
 * `HandoverDoorstepAttestor` (B1, la remise à la porte), sont
 * fournis ET exportés ici, sous leur propre classe : ce sont les réponses du
 * retrait au canal de la livraison. C'est `appBootstrap` qui les branche sur
 * les jetons de la livraison (`useExisting`) — pas ce module.
 */
@Module({
  controllers: [HandoverController, HandoverSupervisionController, DeliveryRunSheetController],
  providers: [
    ConfirmHandoverHandler,
    ConfirmManualHandoverHandler,
    GetDeliveryRunSheetHandler,
    GetHandoverByOrderHandler,
    GetHandoverHandler,
    GetHandoverQueueHandler,
    HandoverAttestation,
    { provide: OrderHandoverRepository, useClass: PrismaOrderHandoverRepository },
    { provide: HandoverAttestationsReader, useClass: PrismaHandoverAttestationsReader },
    { provide: OrderDepartureRepository, useClass: PrismaOrderDepartureRepository },
    { provide: HandoverProofRepository, useClass: PrismaHandoverProofRepository },
    HandoverDepartureHolds,
    HandoverDepartedOrders,
    HandoverDoorstepAttestor,
  ],
  exports: [HandoverDepartureHolds, HandoverDepartedOrders, HandoverDoorstepAttestor],
})
export class HandoverModule {}
