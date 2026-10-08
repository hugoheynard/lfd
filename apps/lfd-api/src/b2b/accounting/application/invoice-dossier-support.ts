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
  const orders = payerOrders(read, companyId, towards);
  return {
    companyId,
    companyName,
    month,
    cycle,
    inProgress: month.equals(current),
    orders,
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
): readonly FrozenInvoiceOrder[] {
  return read
    .filter(
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
    )
    .map((entry) => entry.order);
}
