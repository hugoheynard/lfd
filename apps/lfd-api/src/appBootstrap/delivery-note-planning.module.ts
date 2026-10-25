import { Global, Module } from "@nestjs/common";

import { DeliveryNotesModule } from "../b2b/delivery-notes/delivery-notes.module.js";
import { DeliveryNoteFollower } from "../b2b/delivery-notes/application/services/delivery-note-follower.js";
import { DeliveryNoteFollowing } from "../b2b/orders/domain/ports/delivery-note-following.js";
import { PrismaDeliveryNoteReprintsReader } from "../b2b/delivery-notes/infrastructure/prisma-delivery-note-reprints.reader.js";
import { PrismaShortfallAftermathReader } from "../b2b/orders/infrastructure/prisma-shortfall-aftermath.reader.js";
import {
  DeliveryNoteReprintsReader,
  ShortfallAftermathReader,
} from "../packing/channels/commerce/index.js";

/**
 * Le fil qui relie **la commande à son bon de livraison** (plan
 * plan E1 (`documentation/commandes/bon-de-livraison.md`)).
 *
 * La commande déclare ce dont elle a besoin — prévoir le BL à l'arrêt du
 * plan, le préparer, le remettre, l'annuler avec elle : UN port,
 * `DeliveryNoteFollowing` (plan E2 (`documentation/commandes/bon-de-livraison.md`), § 8.3) — et
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
  providers: [
    { provide: DeliveryNoteFollowing, useExisting: DeliveryNoteFollower },
    // Le poste de colisage demande quels BL sont à réimprimer (plan E6, § 14) :
    // le colisage déclare, les bons de livraison répondent.
    { provide: DeliveryNoteReprintsReader, useExisting: PrismaDeliveryNoteReprintsReader },
    // Le reste abandonné et le BL d'un départ décidé (2026-10-25) : le
    // colisage déclare, la commande répond.
    { provide: ShortfallAftermathReader, useClass: PrismaShortfallAftermathReader },
  ],
  exports: [DeliveryNoteFollowing, DeliveryNoteReprintsReader, ShortfallAftermathReader],
})
export class DeliveryNotePlanningModule {}
