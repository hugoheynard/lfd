import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ORDER_FULFILLED,
  OrderHandedOverEvent,
} from "../../../orders/domain/events/order-handed-over.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { ActorNamer } from "../../domain/ports/actor-namer.js";
import { CustomerNamer } from "../../domain/ports/customer-namer.js";
import { customerLabel, staffCitation } from "./order-fact-names.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RECORD_ORDER_HANDED_OVER = "b2b.growth.record-handed-over";

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
 *
 * Depuis le lot B du plan des phrases (2026-09-19), `handedOverBy` cite la
 * fiche avec son nom du moment (`{ id, name }`, D5), et la ligne porte le nom
 * du client en `subjectLabel` (D6) — lus ici, une fois, au moment du fait.
 *
 * ## Abonné DURABLE depuis le 2026-10-04 (lot E2)
 *
 * Il écoute `order.fulfilled` dans la boîte d'envoi, et tourne donc dans
 * l'unité de travail de la livraison. `record` reste best-effort, mais un
 * échec de base y condamne la transaction : la livraison échoue alors et sera
 * reprise — mieux que le témoin perdu en silence d'avant. La clé
 * d'idempotence garde un seul témoin par commande, rejeu compris.
 */
@Injectable()
@DurableHandler({ type: ORDER_FULFILLED, subscriber: RECORD_ORDER_HANDED_OVER })
export class OnOrderHandedOver implements DurableSubscriber {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly customers: CustomerNamer,
    private readonly actors: ActorNamer,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderHandedOverEvent.fromPayload(delivery.payload);
    const subject = await customerLabel(this.customers, event.placedByUserId);
    const by = await staffCitation(this.actors, event.handedOverBy);
    await this.recorder.record({
      type: ACTIVITY_TYPES.orderHandedOver,
      subjectType: "user",
      subjectId: event.placedByUserId,
      // Déterministe par commande : une remise ne se produit qu'une fois, et un
      // fait rejoué ne doit pas fabriquer un second témoin de la même chose.
      idempotencyKey: `${ACTIVITY_TYPES.orderHandedOver}:${event.orderId}`,
      payload: {
        ...subject,
        orderId: event.orderId,
        orderNumber: event.orderNumber,
        handedOverBy: by,
        handedOverAt: event.handedOverAt.toISOString(),
        // Scannée ou saisie : le témoin doit garder LAQUELLE, pas ce que la
        // ligne dira demain. Les deux n'ont pas la même force.
        via: event.via,
      },
    });
  }
}
