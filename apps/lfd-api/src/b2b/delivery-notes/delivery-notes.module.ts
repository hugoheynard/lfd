import { Module } from "@nestjs/common";

import { OrdersModule } from "../orders/orders.module.js";
import { DeliveryNotePlanner } from "./application/services/delivery-note-planner.js";
import { PlannedDeliveryNoteVoider } from "./application/services/planned-delivery-note-voider.js";
import { DeliveryNoteRepository } from "./domain/ports/delivery-note.repository.js";
import { PrismaDeliveryNoteRepository } from "./infrastructure/prisma-delivery-note.repository.js";

/**
 * **Les bons de livraison** — plan
 * `documentation/commandes/plan-e1-bon-de-livraison-prevu.md`.
 *
 * En E1, une ombre : le BL prévu naît à l'arrêt du plan et s'annule avec sa
 * commande ; aucune route, aucun écran ne le lit. Importe `OrdersModule` pour
 * le seul port `OrderLinesForDeliveryNote` : il lit la commande par lui,
 * jamais dans ses tables. Ses deux services répondent aux ports que la
 * commande déclare, reliés dans `appBootstrap/delivery-note-planning.module.ts`.
 */
@Module({
  imports: [OrdersModule],
  providers: [
    { provide: DeliveryNoteRepository, useClass: PrismaDeliveryNoteRepository },
    DeliveryNotePlanner,
    PlannedDeliveryNoteVoider,
  ],
  exports: [DeliveryNotePlanner, PlannedDeliveryNoteVoider],
})
export class DeliveryNotesModule {}
