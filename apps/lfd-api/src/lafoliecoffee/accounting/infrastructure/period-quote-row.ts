import type { Prisma } from "../../../platform/database/client/client.js";
import type { PeriodQuoteSnapshot, PeriodQuoteState } from "../domain/entities/period-quote.js";
import { UnknownPeriodQuoteStateError } from "../domain/errors/period-quote-errors.js";
import { mandateIdOfColumn } from "./prisma-monthly-invoice-outcomes.js";

/** Les états que le CHECK `period_quote_state_known` admet. */
const STATES: readonly PeriodQuoteState[] = ["awaiting", "invoiced", "superseded"];

/** Ce qu'un devis relu porte : sa ligne et ses commandes. */
export const PERIOD_QUOTE_SELECT = {
  id: true,
  number: true,
  version: true,
  legalEntityId: true,
  payerCompanyId: true,
  payerName: true,
  mandateId: true,
  serviceCode: true,
  periodStartsAt: true,
  periodClosesAt: true,
  state: true,
  fingerprint: true,
  totalTtcCents: true,
  createdAt: true,
  orders: { select: { orderId: true }, orderBy: { orderId: "asc" } },
} as const satisfies Prisma.PeriodQuoteSelect;

type PeriodQuoteRow = Prisma.PeriodQuoteGetPayload<{ select: typeof PERIOD_QUOTE_SELECT }>;

/**
 * La ligne d'un devis → son instantané.
 *
 * @throws {UnknownPeriodQuoteStateError} un état que le CHECK aurait dû refuser.
 */
export function periodQuoteSnapshotOf(row: PeriodQuoteRow): PeriodQuoteSnapshot {
  const state = STATES.find((known) => known === row.state);
  if (state === undefined) {
    throw new UnknownPeriodQuoteStateError(row.id, row.state);
  }
  const { orders, mandateId, ...rest } = row;
  return {
    ...rest,
    state,
    mandateId: mandateIdOfColumn(mandateId),
    orderIds: orders.map((order) => order.orderId),
  };
}
