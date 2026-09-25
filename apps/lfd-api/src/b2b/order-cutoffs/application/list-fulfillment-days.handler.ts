import { type FulfillmentDayView, nextFulfillmentDay } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { SaleOperations } from "../../catalog/application/sale-operations.service.js";
import { firstPickupDay } from "../../catalog/domain/operation-days.js";
import { PickupAddressRepository } from "../../pickup-addresses/domain/pickup-address.repository.js";
import { OrderCutoffRepository } from "../domain/order-cutoff.repository.js";
import { ListFulfillmentDaysQuery } from "./list-fulfillment-days.query.js";

/**
 * **Quelle journée l'écran de commande peut proposer**, point par point.
 *
 * 🔴 Le front la calculait lui-même : « demain », depuis `new Date()`, c'est-à-
 * dire depuis **l'horloge du navigateur du client**. Deux fautes en une — la
 * journée du fournil n'est pas celle d'un poste mal réglé, et « demain » ne
 * regardait aucune heure limite, donc proposait des journées que la commande
 * allait refuser après coup.
 *
 * Le calcul appartient au serveur parce que l'heure appartient au serveur : le
 * `Clock` est la seule source de temps, ici comme dans le refus.
 *
 * ⚠️ Ce que cette lecture rend **ouvre un écran, elle n'autorise rien**. Elle ne
 * connaît que les règles du commerce ; un article peut porter la sienne, et
 * c'est `ensureWithinOrderCutoff`, panier en main, qui tranche. Les deux ne
 * peuvent pas se contredire en silence — celle-ci ne refuse jamais.
 *
 * Un panier qui porte une bûche ne se voit proposer que des jours de retrait
 * de son opération (D6 du plan des opérations datées) : la journée rendue est
 * la première qui tient À LA FOIS dans les délais du commerce et dans ces
 * jours-là, ou `null`. Là encore, `ensureWithinOperation` reste l'autorité.
 */
@QueryHandler(ListFulfillmentDaysQuery)
export class ListFulfillmentDaysHandler implements IQueryHandler<
  ListFulfillmentDaysQuery,
  readonly FulfillmentDayView[]
> {
  constructor(
    private readonly cutoffs: OrderCutoffRepository,
    private readonly pickups: PickupAddressRepository,
    private readonly clock: Clock,
    private readonly sale: SaleOperations,
  ) {}

  async execute(query: ListFulfillmentDaysQuery): Promise<readonly FulfillmentDayView[]> {
    const [rules, points, windows] = await Promise.all([
      this.cutoffs.list(),
      this.pickups.list(),
      this.sale.pickupRangesOf(query.cartSkus, query.audience),
    ]);
    const now = this.clock.now();
    const dayOf = (pickupAddressId: string | null): FulfillmentDayView => ({
      pickupAddressId,
      date: firstPickupDay(nextFulfillmentDay(rules, pickupAddressId, now), windows),
    });
    // Le défaut EN TÊTE et toujours présent : c'est la journée de la livraison,
    // qui ne vise aucun point. Une réponse qui ne listerait que les points
    // laisserait le chemin livraison sans date, donc à réinventer côté écran.
    return [dayOf(null), ...points.map((point) => dayOf(point.id))];
  }
}
