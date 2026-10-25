import type { CustomerNudgeTraceView, CustomerNudgesView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  StaffAuthorDirectory,
  type StaffAuthors,
} from "../../../../staff/directory/domain/staff-author-directory.js";
import type { CustomerNudgeTrace } from "../../domain/entities/order-customer-nudges.js";
import { CustomerNudgeDelaysReader } from "../../domain/ports/customer-nudge-delays.reader.js";
import { CustomerNudgeTraceReader } from "../../domain/ports/customer-nudge-trace.reader.js";
import { GetCustomerNudgesQuery } from "./get-customer-nudges.query.js";

/**
 * **Les relances d'un jour, pour la Supervision** : les deux délais du
 * réglage, et, par commande relancée, qui l'a fait et quand. Trois lectures,
 * jamais N + 1 : les traces du jour, le réglage, puis les noms de l'annuaire
 * staff en un lot.
 *
 * Le délai est rendu, pas appliqué : l'écran s'en sert pour ne proposer le
 * geste qu'à l'heure, et le serveur le rejuge au geste (`OrderCustomerNudges`).
 */
@QueryHandler(GetCustomerNudgesQuery)
export class GetCustomerNudgesHandler implements IQueryHandler<
  GetCustomerNudgesQuery,
  CustomerNudgesView
> {
  constructor(
    private readonly traces: CustomerNudgeTraceReader,
    private readonly delays: CustomerNudgeDelaysReader,
    private readonly staff: StaffAuthorDirectory,
  ) {}

  async execute(query: GetCustomerNudgesQuery): Promise<CustomerNudgesView> {
    const [sent, delays] = await Promise.all([this.traces.sentOn(query.day), this.delays.delays()]);
    const authors = await this.staff.identify(
      sent.flatMap((order) => [
        order.pickupReminder?.byStaffId ?? null,
        order.delayWarning?.byStaffId ?? null,
      ]),
    );
    return {
      date: query.day,
      pickupReminderDelayMinutes: delays.pickupReminderMinutes,
      delayWarningDelayMinutes: delays.delayWarningMinutes,
      orders: sent.map((order) => ({
        orderId: order.orderId,
        pickupReminder: traceViewOf(order.pickupReminder, authors),
        delayWarning: traceViewOf(order.delayWarning, authors),
      })),
    };
  }
}

function traceViewOf(
  trace: CustomerNudgeTrace | null,
  authors: StaffAuthors,
): CustomerNudgeTraceView | null {
  return trace === null
    ? null
    : { at: trace.at.toISOString(), byName: authors.nameOf(trace.byStaffId) };
}
