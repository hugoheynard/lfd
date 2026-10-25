import {
  instantToLocal,
  type DaySupervisionView,
  type LateOrder,
  type ShortfallAwaitingDecision,
} from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderPackingStateReader } from "../../../../packing/channels/commerce/index.js";
import { Clock } from "../../../../platform/time/clock.js";
import { DaySupervisionReader } from "../../domain/ports/day-supervision.reader.js";
import {
  awaitingDecisionOf,
  superviseDay,
  type LateEntry,
} from "../../domain/services/day-supervision.js";
import type { SupervisedOrder } from "../../domain/ports/day-supervision.reader.js";
import { GetDaySupervisionQuery } from "./get-day-supervision.query.js";

/**
 * La Supervision d'un jour : le flux par acheminement, les retards, et le
 * compte des commandes sans date. Les règles vivent dans le domaine
 * (`superviseDay`) ; l'instant vient du `Clock`, une seule fois, et c'est lui
 * que la réponse rend en `asOf` — l'écran dit ainsi à quelle heure il juge.
 *
 * Plan A1 (lot A1.3) : parmi les annulées, celles dont le colisage a retiré
 * la feuille — annulées APRÈS l'arrêt, gardées au compte à produire — sont
 * comptées à part (`cancelledAfterPlan`). Le colisage le dit par son canal ;
 * seules les annulées lui sont demandées.
 */
@QueryHandler(GetDaySupervisionQuery)
export class GetDaySupervisionHandler implements IQueryHandler<
  GetDaySupervisionQuery,
  DaySupervisionView
> {
  constructor(
    private readonly reader: DaySupervisionReader,
    private readonly clock: Clock,
    private readonly packing: OrderPackingStateReader,
  ) {}

  async execute(query: GetDaySupervisionQuery): Promise<DaySupervisionView> {
    const now = this.clock.now();
    // Le jour de Paris, et non `toISOString().slice(0, 10)` : à 00 h 30 l'été,
    // il est encore la veille en UTC.
    const day = query.day ?? instantToLocal(now).day;
    const [orders, undated] = await Promise.all([
      this.reader.ordersOn(day),
      this.reader.countUndated(),
    ]);
    const { flow, late } = superviseDay(day, orders, now, await this.withdrawnAmong(orders));
    return {
      date: day,
      asOf: now.toISOString(),
      flow: [...flow],
      late: late.map(toLateOrder),
      awaitingDecision: awaitingDecisionOf(orders).map(toAwaitingDecision),
      undated,
    };
  }

  /** Les annulées dont la feuille est retirée au colisage. */
  private async withdrawnAmong(orders: readonly SupervisedOrder[]): Promise<ReadonlySet<string>> {
    const cancelled = orders
      .filter((order) => order.status === "cancelled")
      .map((order) => order.orderId);
    if (cancelled.length === 0) {
      return new Set();
    }
    const states = await this.packing.packedAmong(cancelled);
    return new Set(cancelled.filter((orderId) => states.get(orderId) === "withdrawn"));
  }
}

function toAwaitingDecision(
  order: SupervisedOrder & { readonly shortfallReportedAt: Date },
): ShortfallAwaitingDecision {
  return {
    orderId: order.orderId,
    reference: order.reference,
    customerName: order.customerName,
    fulfillmentMethod: order.fulfillmentMethod,
    reportedAt: order.shortfallReportedAt.toISOString(),
    lines: order.shortfallLines.map((line) => ({ ...line })),
  };
}

function toLateOrder({ order, window, stage, rule }: LateEntry): LateOrder {
  return {
    orderId: order.orderId,
    reference: order.reference,
    customerName: order.customerName,
    fulfillmentMethod: order.fulfillmentMethod,
    window: { start: window.start, end: window.end, source: window.source },
    stage,
    rule,
  };
}
