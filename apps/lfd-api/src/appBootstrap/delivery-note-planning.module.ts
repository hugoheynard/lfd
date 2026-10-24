import { Global, Module } from "@nestjs/common";

import { DeliveryNotesModule } from "../b2b/delivery-notes/delivery-notes.module.js";
import { DeliveryNoteFollower } from "../b2b/delivery-notes/application/services/delivery-note-follower.js";
import { DeliveryNoteFollowing } from "../b2b/orders/domain/ports/delivery-note-following.js";

/**
 * Le fil qui relie **la commande à son bon de livraison** (plan
 * `documentation/commandes/plan-e1-bon-de-livraison-prevu.md`).
 *
 * La commande déclare ce dont elle a besoin — prévoir le BL à l'arrêt du
 * plan, le préparer, le remettre, l'annuler avec elle : UN port,
 * `DeliveryNoteFollowing` (plan `plan-e2-rattrapage-des-bons.md`, § 8.3) — et
 * les bons de livraison y répondent. Le câblage
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
  providers: [{ provide: DeliveryNoteFollowing, useExisting: DeliveryNoteFollower }],
  exports: [DeliveryNoteFollowing],
})
export class DeliveryNotePlanningModule {}
