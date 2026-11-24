import { Injectable } from "@nestjs/common";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { BasketBuyerStanding } from "../../../channels/commerce/basket-buyer-standing.js";
import {
  RECURRING_BASKET_OPENED,
  RECURRING_BASKET_STOPPED,
  RecurringBasketFact,
  type RecurringBasketFactType,
} from "../../../channels/commerce/basket-facts.js";
import type { Basket } from "../../domain/entities/basket.js";

/** Les gestes qui n'ont lieu qu'une fois par panier : leur clé est le panier. */
const ONCE_PER_BASKET: readonly RecurringBasketFactType[] = [
  RECURRING_BASKET_OPENED,
  RECURRING_BASKET_STOPPED,
];

/**
 * **Écrit le fait durable d'un geste sur un panier** (plan
 * `plan-bloc-recurrent.md`, § 6.2). À appeler DANS l'unité de travail du
 * geste : le fait part ou tombe avec l'écriture, et le principal du site y
 * est lu sous le verrou de sa ligne.
 *
 * Un panier sans société porte un site `null` : le fait part quand même —
 * c'est un fait du bloc, pas un avis ; l'abonné de l'avis le laisse passer.
 */
@Injectable()
export class BasketFacts {
  constructor(
    private readonly standing: BasketBuyerStanding,
    private readonly durable: DurablePublisher,
    private readonly ids: IdGenerator,
  ) {}

  async publish(type: RecurringBasketFactType, basket: Basket): Promise<void> {
    const site = basket.companyId === null ? null : await this.standing.siteOf(basket.companyId);
    const fact = new RecurringBasketFact(
      type,
      basket.id,
      basket.buyerUserId,
      basket.cadence,
      site,
      ONCE_PER_BASKET.includes(type) ? null : this.ids.next(),
    );
    await this.durable.publish(fact.durableFact());
  }
}
