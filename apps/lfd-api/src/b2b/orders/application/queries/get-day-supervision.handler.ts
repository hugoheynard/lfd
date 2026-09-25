import { instantToLocal, type DaySupervisionView, type LateOrder } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { DaySupervisionReader } from "../../domain/ports/day-supervision.reader.js";
import { superviseDay, type LateEntry } from "../../domain/services/day-supervision.js";
import { GetDaySupervisionQuery } from "./get-day-supervision.query.js";

/**
 * La Supervision d'un jour : le flux par acheminement, les retards, et le
 * compte des commandes sans date. Les règles vivent dans le domaine
 * (`superviseDay`) ; l'instant vient du `Clock`, une seule fois, et c'est lui
 * que la réponse rend en `asOf` — l'écran dit ainsi à quelle heure il juge.
 */
@QueryHandler(GetDaySupervisionQuery)
export class GetDaySupervisionHandler implements IQueryHandler<
  GetDaySupervisionQuery,
  DaySupervisionView
> {
  constructor(
    private readonly reader: DaySupervisionReader,
    private readonly clock: Clock,
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
    const { flow, late } = superviseDay(day, orders, now);
    return {
      date: day,
      asOf: now.toISOString(),
      flow: [...flow],
      late: late.map(toLateOrder),
      undated,
    };
  }
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
