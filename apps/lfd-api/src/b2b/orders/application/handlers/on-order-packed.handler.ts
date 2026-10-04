import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  OrderPackedEvent,
  PRODUCTION_ORDER_PACKED,
} from "../../../../production/channels/commerce/index.js";
import { MarkOrderReadyCommand } from "../commands/mark-order-ready.command.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_ORDER_PACKED = "b2b.orders.mark-ready";

/**
 * **Le commerce apprend qu'un bac est fait**, et en tire son propre statut.
 *
 * ## Pourquoi il passe par la COMMANDE, et pas par le dépôt
 *
 * `MarkOrderReadyCommand` porte déjà tout ce que le commerce sait de cette
 * transition : la garde d'état (`packingBlocker`), l'arbitrage de course, et la
 * publication d'`OrderReadyEvent` — que le journal et le courriel « votre
 * commande est prête » écoutent. L'appeler garde ces trois-là intacts ; appeler
 * le dépôt directement les aurait tous les trois contournés en silence.
 *
 * ## Abonné DURABLE depuis le 2026-10-04 (lot E1)
 *
 * Jusque-là, le fait passait par le bus en mémoire, « ni persisté ni rejoué » :
 * un container qui tombait entre le colisage et cette écriture laissait la
 * commande `confirmed` avec un bac fait, et seul un rescan humain rattrapait.
 * Le fait est désormais écrit dans la boîte d'envoi avec le colisage (plan
 * `documentation/journalisation/plan-evenements-durables.md`) : livré au moins
 * une fois, et la garde du relais pose le reçu dans la même unité de travail
 * que l'écriture — un doublon du MÊME fait est sauté.
 *
 * ## Idempotent pour de vrai
 *
 * Deux faits différents pour la même commande existent (colisage, puis rescan) :
 * `MarkOrderReadyCommand` ne fait rien sur une commande déjà prête — ni
 * écriture, ni second courriel. Elle levait jusqu'au 2026-10-04.
 *
 * ⚠️ Un `packingBlocker` qui refuse — commande annulée, retirée sans avoir été
 * prête — fait échouer la livraison, qui finit en message mort visible plutôt
 * qu'en divergence muette. Ça ne peut pas arriver aujourd'hui (vérifié le
 * 2026-09-26) : les seules annulations ne touchent qu'un règlement non encaissé,
 * que le plan du soir n'inscrit jamais.
 *
 * Le relais l'inscrit à `BackgroundWork` : c'est ce que `lint:events-tracked`
 * vérifie sur un `@DurableHandler`.
 */
@Injectable()
@DurableHandler({ type: PRODUCTION_ORDER_PACKED, subscriber: ON_ORDER_PACKED })
export class OnOrderPacked implements DurableSubscriber {
  constructor(private readonly commands: CommandBus) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderPackedEvent.fromPayload(delivery.payload);
    // L'identité et l'instant viennent du FAIT, pas de l'horloge d'ici : le
    // colisage a eu lieu au fournil, et c'est cette heure-là qui compte.
    await this.commands.execute(
      new MarkOrderReadyCommand(event.reference, event.packedBy, event.packedAt),
    );
  }
}
