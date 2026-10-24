import { Global, Module } from "@nestjs/common";

import { DeliveryNotesModule } from "../b2b/delivery-notes/delivery-notes.module.js";
import { DeliveryNotePlanner } from "../b2b/delivery-notes/application/services/delivery-note-planner.js";
import { PlannedDeliveryNoteVoider } from "../b2b/delivery-notes/application/services/planned-delivery-note-voider.js";
import {
  DeliveryNotePlanning,
  PlannedDeliveryNoteVoiding,
} from "../b2b/orders/domain/ports/delivery-note-planning.js";

/**
 * Le fil qui relie **la commande à son bon de livraison** (plan
 * `documentation/commandes/plan-e1-bon-de-livraison-prevu.md`).
 *
 * La commande déclare ce dont elle a besoin — prévoir le BL à l'arrêt du
 * plan, l'annuler avec elle — et les bons de livraison y répondent. Le câblage
 * vit ici pour la même raison que `LoyaltyVoucherModule` : `DeliveryNotesModule`
 * importe `OrdersModule` pour lire la commande, et l'import inverse ferait un
 * cycle. `@Global` : le consommateur est `orders`.
 *
 * ⚠️ `lint:context-boundaries` ne regarde pas l'intérieur de `b2b` : cette
 * frontière tient par discipline, pas par la porte.
 */
@Global()
@Module({
  imports: [DeliveryNotesModule],
  providers: [
    { provide: DeliveryNotePlanning, useExisting: DeliveryNotePlanner },
    { provide: PlannedDeliveryNoteVoiding, useExisting: PlannedDeliveryNoteVoider },
  ],
  exports: [DeliveryNotePlanning, PlannedDeliveryNoteVoiding],
})
export class DeliveryNotePlanningModule {}
