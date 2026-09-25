import { Module } from "@nestjs/common";

import { ConfirmHandoverHandler } from "./application/commands/confirm-handover.handler.js";
import { ConfirmManualHandoverHandler } from "./application/commands/confirm-manual-handover.handler.js";
import { GetHandoverByOrderHandler } from "./application/queries/get-handover-by-order.handler.js";
import { GetHandoverQueueHandler } from "./application/queries/get-handover-queue.handler.js";
import { GetHandoverHandler } from "./application/queries/get-handover.handler.js";
import { HandoverAttestation } from "./application/services/handover-attestation.service.js";
import { HandoverAttestationsReader } from "./domain/ports/handover-attestations.reader.js";
import { OrderHandoverRepository } from "./domain/ports/order-handover.repository.js";
import { HandoverController } from "./http/handover.controller.js";
import { HandoverSupervisionController } from "./http/handover-supervision.controller.js";
import { PrismaHandoverAttestationsReader } from "./infrastructure/prisma-handover-attestations.reader.js";
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
 */
@Module({
  controllers: [HandoverController, HandoverSupervisionController],
  providers: [
    ConfirmHandoverHandler,
    ConfirmManualHandoverHandler,
    GetHandoverByOrderHandler,
    GetHandoverHandler,
    GetHandoverQueueHandler,
    HandoverAttestation,
    { provide: OrderHandoverRepository, useClass: PrismaOrderHandoverRepository },
    { provide: HandoverAttestationsReader, useClass: PrismaHandoverAttestationsReader },
  ],
})
export class HandoverModule {}
