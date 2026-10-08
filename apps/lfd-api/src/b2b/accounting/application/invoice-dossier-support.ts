import type { OrderDeliveryHistoryReader } from "../../../delivery/channels/commerce/index.js";
import type { OrderHandoverHistoryReader } from "../../../handover/channels/commerce/index.js";
import type { Clock } from "../../../platform/time/clock.js";
import { StatementCompanyNotFoundError } from "../domain/errors/statement-errors.js";
import type {
  InvoiceDossierOrder,
  InvoiceDossierReader,
} from "../domain/ports/invoice-dossier.reader.js";
import type {
  BillingFollow,
  StatementBillingReader,
} from "../domain/ports/statement-billing.reader.js";
import { billedPayerOf } from "../domain/services/billed-payer.js";
import type { BillingCycle } from "../domain/services/billing-cycle.js";
import {
  dossierCalendarNotes,
  type DossierCalendarNotes,
} from "../domain/services/invoice-dossier-calendar.js";
import {
  neverHandedOver,
  orderHistory,
  type DossierOrderRecord,
  type DossierStopFact,
} from "../domain/services/invoice-dossier-history.js";
import { simulateInvoiceDossier } from "../domain/services/invoice-dossier.js";
import type {
  FrozenInvoiceOrder,
  InvoiceDossier,
} from "../domain/services/invoice-dossier.types.js";
import { StatementMonth } from "../domain/value-objects/statement-month.js";

/**
 * Le dossier de facturation, **construit une seule fois pour quatre sorties** —
 * la vue et les trois CSV — sur le modèle de `cycle-statement-support.ts` : un
 * export qui passerait par un autre chemin que l'écran finirait par ne plus
 * dire la même chose.
 */
export interface InvoiceDossierDeps {
  readonly dossiers: InvoiceDossierReader;
  readonly billing: StatementBillingReader;
  /** Le retrait de chaque bon — déclaré et implémenté par `handover` (DF3). */
  readonly handovers: OrderHandoverHistoryReader;
  /** Les arrêts de chaque bon — déclaré et implémenté par `delivery` (DF3). */
  readonly deliveries: OrderDeliveryHistoryReader;
  readonly clock: Clock;
}

export interface BuiltInvoiceDossier {
  readonly companyId: string;
  readonly companyName: string;
  readonly month: StatementMonth;
  readonly cycle: BillingCycle;
  readonly inProgress: boolean;
  /** Les bons du dossier, du plus ancien au plus récent. */
  readonly orders: readonly FrozenInvoiceOrder[];
  /** Les mêmes bons, dans le même ordre, avec leur lieu et leur frise. */
  readonly records: readonly DossierOrderRecord[];
  /** Références des bons facturés sans aucun fait de retrait (§3.3, Q1). */
  readonly neverHandedOver: readonly string[];
  readonly dossier: InvoiceDossier;
  readonly calendar: DossierCalendarNotes;
}

/**
 * @throws {InvalidStatementMonthError} `month` n'est pas `AAAA-MM`.
 * @throws {FutureStatementMonthError} `month` n'a pas commencé.
 * @throws {StatementCompanyNotFoundError} la société n'existe pas.
 * @throws {InvoiceDossierLateFeeRateMissingError} un bon porte une surtaxe sans taux.
 * @throws {InvoiceDossierUnreadableVatRateError} un bon porte un taux de ligne illisible.
 */
export async function buildInvoiceDossier(
  deps: InvoiceDossierDeps,
  companyId: string,
  requestedMonth: string | undefined,
): Promise<BuiltInvoiceDossier> {
  const now = deps.clock.now();
  const current = StatementMonth.containing(now);
  const month =
    requestedMonth === undefined ? current : StatementMonth.requested(requestedMonth, now);
  const companyName = await deps.dossiers.dossierCompanyName(companyId);
  if (companyName === null) {
    throw new StatementCompanyNotFoundError(companyId);
  }
  const cycle = month.cycle();
  const towards = await deps.billing.followsTowards(companyId, cycle);
  const siteIds = [...new Set(towards.map((follow) => follow.companyId))];
  const read = await deps.dossiers.dossierOrders([companyId, ...siteIds], cycle);
  const entries = payerOrders(read, companyId, towards);
  const orders = entries.map((entry) => entry.order);
  const records = await withHistories(deps, entries);
  return {
    companyId,
    companyName,
    month,
    cycle,
    inProgress: month.equals(current),
    orders,
    records,
    neverHandedOver: neverHandedOver(records),
    dossier: simulateInvoiceDossier(orders),
    calendar: dossierCalendarNotes(orders, month.toString()),
  };
}

/**
 * Le périmètre du relevé (`payerStatement`), au bon près : les bons de la
 * société elle-même, et ceux de ses sites qu'elle réglait à leur date.
 */
function payerOrders(
  read: readonly InvoiceDossierOrder[],
  payerId: string,
  towards: readonly BillingFollow[],
): readonly InvoiceDossierOrder[] {
  return read.filter(
    (entry) =>
      entry.companyId === payerId ||
      billedPayerOf(
        {
          companyId: entry.companyId,
          placedAt: entry.order.createdAt,
          billedCompanyId: entry.billedCompanyId,
        },
        towards,
      ) === payerId,
  );
}

/** Deux lectures par lot, une par bloc — jamais une par bon. */
async function withHistories(
  deps: InvoiceDossierDeps,
  entries: readonly InvoiceDossierOrder[],
): Promise<readonly DossierOrderRecord[]> {
  const ids = entries.map((entry) => entry.orderId);
  const [handovers, stops] = await Promise.all([
    deps.handovers.ofOrders(ids),
    deps.deliveries.ofOrders(ids),
  ]);
  const stopsByOrder = new Map<string, DossierStopFact[]>();
  for (const stop of stops) {
    const list = stopsByOrder.get(stop.orderId) ?? [];
    list.push(stop);
    stopsByOrder.set(stop.orderId, list);
  }
  return entries.map((entry) => ({
    order: entry.order,
    place: entry.place,
    history: orderHistory(
      handovers.get(entry.orderId) ?? null,
      stopsByOrder.get(entry.orderId) ?? [],
    ),
  }));
}
