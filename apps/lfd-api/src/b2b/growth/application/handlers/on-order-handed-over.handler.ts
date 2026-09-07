import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { OrderHandedOverEvent } from "../../../orders/domain/events/order-handed-over.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";

/**
 * Abonné du journal : `order.handed_over` → **le témoin immuable d'une remise**.
 *
 * ## Ce qu'il répare
 *
 * La naissance d'une commande entrait au journal, sa délivrance n'y entrait pas.
 * On pouvait donc dire « ce client a commandé » et jamais « ce client a reçu » —
 * exactement la moitié qu'on voudrait produire en cas de litige.
 *
 * L'attestation vivait sur `handedOverAt` / `handedOverBy`, deux colonnes d'une
 * ligne qui s'`UPDATE`. Un avenant, un correctif, un script de rattrapage
 * pouvaient les réécrire sans laisser de trace — et une attestation qu'on peut
 * réécrire sans témoin n'atteste plus grand-chose. Le journal, lui, est
 * **append-only** : c'est son seul invariant, et c'est précisément celui qui
 * manquait.
 *
 * ## Pourquoi `record` et non `recordOrFail`
 *
 * Le port offre les deux, et le choix appartient à l'émetteur. `recordOrFail`
 * remonterait la panne et annulerait la transaction : c'est ce qu'il faut pour
 * une modification de fiche, où une trace manquée en silence est pire que
 * l'échec.
 *
 * **Ce n'est pas ce qu'il faut ici.** Au comptoir, refuser une remise parce
 * qu'une table analytique est indisponible échangerait un service réel contre
 * un enregistrement. Une boulangerie ne cesse pas de servir parce qu'un journal
 * est tombé. Le témoin est donc **best-effort par décision**, et l'attestation
 * transactionnelle reste sur la commande — le journal la double, il ne la
 * remplace pas.
 *
 * ## Ce qu'il fige, et pourquoi il ne rejoint rien
 *
 * `handedOverBy` et `handedOverAt` sont **portés par le fait**, pas relus à
 * l'affichage. Un journal doit dire ce qui était vrai ce jour-là ; aller les
 * chercher plus tard donnerait ce qui est vrai aujourd'hui, c'est-à-dire
 * exactement ce qu'on veut pouvoir contredire.
 */
@EventsHandler(OrderHandedOverEvent)
export class OnOrderHandedOver implements IEventHandler<OrderHandedOverEvent> {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: OrderHandedOverEvent): void {
    void this.work.track(this.run(event), "on-order-handed-over");
  }

  private async run(event: OrderHandedOverEvent): Promise<void> {
    await this.recorder.record({
      type: ACTIVITY_TYPES.orderHandedOver,
      subjectType: "user",
      subjectId: event.placedByUserId,
      // Déterministe par commande : une remise ne se produit qu'une fois, et un
      // fait rejoué ne doit pas fabriquer un second témoin de la même chose.
      idempotencyKey: `${ACTIVITY_TYPES.orderHandedOver}:${event.orderId}`,
      payload: {
        orderId: event.orderId,
        orderNumber: event.orderNumber,
        handedOverBy: event.handedOverBy,
        handedOverAt: event.handedOverAt.toISOString(),
        // Scannée ou saisie : le témoin doit garder LAQUELLE, pas ce que la
        // ligne dira demain. Les deux n'ont pas la même force.
        via: event.via,
      },
    });
  }
}
