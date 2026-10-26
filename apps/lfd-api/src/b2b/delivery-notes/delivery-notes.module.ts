import { Module } from "@nestjs/common";

import { BrandModule } from "../../platform/brand/brand.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { GetAdminClientNotePdfHandler } from "./application/queries/get-admin-client-note-pdf.handler.js";
import { GetCarrierNotePdfHandler } from "./application/queries/get-carrier-note-pdf.handler.js";
import { GetCarrierNoteSpecimenHandler } from "./application/queries/get-carrier-note-specimen.handler.js";
import { GetClientNotePdfHandler } from "./application/queries/get-client-note-pdf.handler.js";
import { GetClientNoteSpecimenHandler } from "./application/queries/get-client-note-specimen.handler.js";
import { ListOrderDeliveryNotesHandler } from "./application/queries/list-order-delivery-notes.handler.js";
import { DeliveryNoteDocuments } from "./application/services/delivery-note-documents.js";
import { DeliveryNoteReader } from "./domain/ports/delivery-note.reader.js";
import { AdminDeliveryNoteSpecimensController } from "./http/admin-delivery-note-specimens.controller.js";
import { AdminOrderDeliveryNotesController } from "./http/admin-order-delivery-notes.controller.js";
import { DeliveryNotesController } from "./http/delivery-notes.controller.js";
import { PrismaDeliveryNoteReader } from "./infrastructure/prisma-delivery-note.reader.js";
import { ReconcileDeliveryNotesHandler } from "./application/commands/reconcile-delivery-notes.handler.js";
import { AdminDeliveryNotesController } from "./http/admin-delivery-notes.controller.js";
import { DeliveryNotesReconcileController } from "./http/delivery-notes-reconcile.controller.js";
import { DeliveryNotePlanner } from "./application/services/delivery-note-planner.js";
import { DeliveryNoteAligner } from "./application/services/delivery-note-aligner.js";
import { DeliveryNoteFollower } from "./application/services/delivery-note-follower.js";
import { DeliveryNoteRepository } from "./domain/ports/delivery-note.repository.js";
import { PrismaDeliveryNoteRepository } from "./infrastructure/prisma-delivery-note.repository.js";
import { PrepareRemainderNoteHandler } from "./application/commands/prepare-remainder-note.handler.js";
import { OnRemainderPacked } from "./application/handlers/on-remainder-packed.handler.js";
import { RecordDeliveryNotePrintHandler } from "./application/commands/record-delivery-note-print.handler.js";
import { PrismaDeliveryNoteReprintsReader } from "./infrastructure/prisma-delivery-note-reprints.reader.js";
import { OrderBillingCloser } from "./application/services/order-billing-closer.js";
import {
  ProductionPlannedDeliveryNotesReader,
  ProductionSpecimenDeliveryNoteReader,
} from "./infrastructure/production-planned-delivery-notes.reader.js";

/**
 * **Les bons de livraison** — plan
 * plan E1 (`documentation/commandes/bon-de-livraison.md`).
 *
 * Le BL prévu naît à l'arrêt du plan et s'annule avec sa commande (E1) ;
 * depuis E5a, il s'imprime — transport et chiffré — depuis la fiche commande,
 * l'espace client et la planche des documents. Importe `OrdersModule` pour
 * les ports de lecture que la commande déclare (`OrderLinesForDeliveryNote`,
 * `OrderProgressForDeliveryNote`, `OrdersToReconcileDeliveryNotes`) : il lit
 * la commande par eux, jamais dans ses tables. `DeliveryNoteFollower` répond
 * au port `DeliveryNoteFollowing`, relié dans
 * `appBootstrap/delivery-note-planning.module.ts` (plan E2, § 8.3).
 */
@Module({
  imports: [OrdersModule, BrandModule],
  controllers: [
    DeliveryNotesReconcileController,
    AdminDeliveryNotesController,
    AdminOrderDeliveryNotesController,
    DeliveryNotesController,
    AdminDeliveryNoteSpecimensController,
  ],
  providers: [
    ReconcileDeliveryNotesHandler,
    RecordDeliveryNotePrintHandler,
    PrepareRemainderNoteHandler,
    OnRemainderPacked,
    ListOrderDeliveryNotesHandler,
    GetCarrierNotePdfHandler,
    GetAdminClientNotePdfHandler,
    GetClientNotePdfHandler,
    GetCarrierNoteSpecimenHandler,
    GetClientNoteSpecimenHandler,
    DeliveryNoteDocuments,
    { provide: DeliveryNoteRepository, useClass: PrismaDeliveryNoteRepository },
    { provide: DeliveryNoteReader, useClass: PrismaDeliveryNoteReader },
    DeliveryNotePlanner,
    DeliveryNoteAligner,
    DeliveryNoteFollower,
    OrderBillingCloser,
    PrismaDeliveryNoteReprintsReader,
    ProductionPlannedDeliveryNotesReader,
    ProductionSpecimenDeliveryNoteReader,
  ],
  exports: [
    DeliveryNoteFollower,
    PrismaDeliveryNoteReprintsReader,
    ProductionPlannedDeliveryNotesReader,
    ProductionSpecimenDeliveryNoteReader,
  ],
})
export class DeliveryNotesModule {}
