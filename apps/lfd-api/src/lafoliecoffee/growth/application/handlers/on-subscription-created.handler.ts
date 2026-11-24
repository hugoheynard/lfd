import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  RECURRING_BASKET_OPENED,
  RecurringBasketFact,
} from "../../../../recurring/channels/commerce/index.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { CustomerNamer } from "../../domain/ports/customer-namer.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RECORD_SUBSCRIPTION_CREATED = "b2b.growth.record-subscription-created";

/**
 * Abonné du journal : `recurring.basket_opened` (le fait durable du bloc des
 * paniers) → `subscription.created`, une ligne d'activité sur la PERSONNE
 * (signal « lead qualifié », récurrence = engagement). Le type du journal
 * reste `subscription.created` : c'est une valeur écrite, et le score des
 * leads la lit sous cette forme.
 *
 * Clé d'idempotence déterministe par panier : un rejeu du fait n'écrit
 * qu'une ligne. La personne y est nommée au moment du fait (`subjectLabel`)
 * — sans libellé si sa fiche n'a pas de nom : le port ne se rabat jamais sur
 * l'adresse.
 */
@Injectable()
@DurableHandler({ type: RECURRING_BASKET_OPENED, subscriber: RECORD_SUBSCRIPTION_CREATED })
export class OnSubscriptionCreated implements DurableSubscriber {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly customers: CustomerNamer,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = RecurringBasketFact.fromDelivery(delivery);
    const name = await this.nameOrNull(fact.buyerUserId);
    await this.recorder.record({
      type: ACTIVITY_TYPES.subscriptionCreated,
      subjectType: "user",
      subjectId: fact.buyerUserId,
      idempotencyKey: `${ACTIVITY_TYPES.subscriptionCreated}:${fact.basketId}`,
      payload: {
        ...(name === null ? {} : { subjectLabel: name }),
        subscriptionId: fact.basketId,
        recurrence: fact.cadence,
      },
    });
  }

  /** L'annuaire est best-effort : une fiche illisible ne perd pas le fait, seulement son libellé. */
  private async nameOrNull(userId: string): Promise<string | null> {
    try {
      return await this.customers.nameOf(userId);
    } catch {
      return null;
    }
  }
}
