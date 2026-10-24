import { Module } from "@nestjs/common";

import { OrdersModule } from "../orders/orders.module.js";
import { ReconcileDeliveryNotesHandler } from "./application/commands/reconcile-delivery-notes.handler.js";
import { AdminDeliveryNotesController } from "./http/admin-delivery-notes.controller.js";
import { DeliveryNotesReconcileController } from "./http/delivery-notes-reconcile.controller.js";
import { DeliveryNotePlanner } from "./application/services/delivery-note-planner.js";
import { DeliveryNoteAligner } from "./application/services/delivery-note-aligner.js";
import { DeliveryNoteFollower } from "./application/services/delivery-note-follower.js";
import { DeliveryNoteRepository } from "./domain/ports/delivery-note.repository.js";
import { PrismaDeliveryNoteRepository } from "./infrastructure/prisma-delivery-note.repository.js";

/**
 * **Les bons de livraison** — plan
 * `documentation/commandes/plan-e1-bon-de-livraison-prevu.md`.
 *
 * En E1, une ombre : le BL prévu naît à l'arrêt du plan et s'annule avec sa
 * commande ; aucune route, aucun écran ne le lit. Importe `OrdersModule` pour
 * les ports de lecture que la commande déclare (`OrderLinesForDeliveryNote`,
 * `OrderProgressForDeliveryNote`, `OrdersToReconcileDeliveryNotes`) : il lit
 * la commande par eux, jamais dans ses tables. `DeliveryNoteFollower` répond
 * au port `DeliveryNoteFollowing`, relié dans
 * `appBootstrap/delivery-note-planning.module.ts` (plan E2, § 8.3).
 */
@Module({
  imports: [OrdersModule],
  controllers: [DeliveryNotesReconcileController, AdminDeliveryNotesController],
  providers: [
    ReconcileDeliveryNotesHandler,
    { provide: DeliveryNoteRepository, useClass: PrismaDeliveryNoteRepository },
    DeliveryNotePlanner,
    DeliveryNoteAligner,
    DeliveryNoteFollower,
  ],
  exports: [DeliveryNoteFollower],
})
export class DeliveryNotesModule {}
