import {
  addDays,
  type FulfillmentDayView,
  instantToLocal,
  NEXT_FULFILLMENT_HORIZON_DAYS,
  nextFulfillmentDay,
} from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { SaleOperations } from "../../catalog/application/sale-operations.service.js";
import { firstPickupDay } from "../../catalog/domain/operation-days.js";
import { PickupAddressRepository } from "../../pickup-addresses/domain/pickup-address.repository.js";
import { ClosedPlansReader } from "../../../production/channels/commerce/index.js";
import { OrderCutoffSettingsReader } from "../domain/order-cutoff-settings.reader.js";
import { OrderCutoffsInForce } from "../domain/order-cutoffs-in-force.js";
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
 *
 * Depuis le lot O3 (`plan-reglages-commandes.md`, §8, 2026-10-14) : les règles
 * EN VIGUEUR (aucune quand l'heure limite générale est désactivée), et les
 * journées dont le plan du fournil est arrêté sont sautées — la passation les
 * refuserait —, comme aujourd'hui quand le réglage « jour même » ne l'autorise
 * pas (§8.3). Une journée d'opération repoussée sur un plan arrêté n'est pas
 * resautée : cas d'école (une opération ouvre loin devant, un plan s'arrête la
 * veille), et la passation reste l'autorité.
 */
@QueryHandler(ListFulfillmentDaysQuery)
export class ListFulfillmentDaysHandler implements IQueryHandler<
  ListFulfillmentDaysQuery,
  readonly FulfillmentDayView[]
> {
  constructor(
    private readonly cutoffs: OrderCutoffsInForce,
    private readonly pickups: PickupAddressRepository,
    private readonly clock: Clock,
    private readonly sale: SaleOperations,
    private readonly plans: ClosedPlansReader,
    private readonly settings: OrderCutoffSettingsReader,
  ) {}

  async execute(query: ListFulfillmentDaysQuery): Promise<readonly FulfillmentDayView[]> {
    const now = this.clock.now();
    const today = instantToLocal(now).day;
    const [rules, points, windows, closed, settings] = await Promise.all([
      this.cutoffs.list(),
      this.pickups.list(),
      this.sale.pickupRangesOf(query.cartSkus, query.audience),
      this.plans.closedBetween(today, addDays(today, NEXT_FULFILLMENT_HORIZON_DAYS)),
      this.settings.current(),
    ]);
    // Aujourd'hui n'est proposé que si le réglage « jour même » l'autorise (§8.3).
    const unavailable = new Set(settings.sameDayAllowed ? closed : [...closed, today]);
    const dayOf = (pickupAddressId: string | null): FulfillmentDayView => ({
      pickupAddressId,
      date: firstPickupDay(
        nextFulfillmentDay(rules, pickupAddressId, now, NEXT_FULFILLMENT_HORIZON_DAYS, unavailable),
        windows,
      ),
    });
    // Le défaut EN TÊTE et toujours présent : c'est la journée de la livraison,
    // qui ne vise aucun point. Une réponse qui ne listerait que les points
    // laisserait le chemin livraison sans date, donc à réinventer côté écran.
    return [dayOf(null), ...points.map((point) => dayOf(point.id))];
  }
}
