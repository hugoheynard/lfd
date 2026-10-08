import { addDays, instantToLocal, localToInstant } from "@lfd/contracts";

import { SEPA_DIRECT_DEBIT, type InvoicePaymentMeans } from "../entities/invoice.types.js";
import { BillingCycleBoundaryError } from "../errors/accounting-errors.js";
import type { BillingFollow } from "../ports/statement-billing.reader.js";
import { StatementMonth } from "../value-objects/statement-month.js";
import { billedPayerOf } from "./billed-payer.js";
import { effectiveMandateOf, type VerdictContext } from "./collection-verdict.js";
import type { DossierHandoverFact, DossierStopFact } from "./invoice-dossier-history.js";
import { orderHistory } from "./invoice-dossier-history.js";
import { isBillable } from "./invoice-billability.js";
import type { FrozenInvoiceOrder } from "./invoice-dossier.types.js";

/**
 * **La facture du mois**, sa partie pure (plan
 * `documentation/comptabilite/facturation/plan-emission-de-la-facture.md`, § 3, lot E4) :
 * quand elle s'émet, à quelle date, qui elle facture, sous quel moyen.
 *
 * Ni horloge, ni port : l'instant et les bons sont donnés.
 */

/** L'heure de l'émission, le dernier jour du mois, à Paris (§ 4). */
export const MONTHLY_INVOICE_TIME = "22:00";

/** Le dernier jour (local) d'un mois — la date d'émission de ses factures. */
export function lastDayOf(month: StatementMonth): string {
  return addDays(instantToLocal(month.cycle().closesAt).day, -1);
}

/**
 * L'instant à partir duquel les factures d'un mois s'émettent : son dernier
 * jour à 22h, heure de Paris.
 *
 * @throws {BillingCycleBoundaryError} l'heure n'existe pas ce jour-là (jamais à Paris).
 */
export function invoicingMomentOf(month: StatementMonth): Date {
  const day = lastDayOf(month);
  const moment = localToInstant(day, MONTHLY_INVOICE_TIME);
  if (moment === null) {
    throw new BillingCycleBoundaryError(day, MONTHLY_INVOICE_TIME);
  }
  return moment;
}

/**
 * Le mois dont on émet les factures à `now` : le dernier dont l'instant
 * d'émission est passé — le mois courant à partir de son dernier jour 22h,
 * le précédent avant. Ce qui fait du mois une clé stable pour « déjà tenté ».
 */
export function monthToInvoice(now: Date): StatementMonth {
  const current = StatementMonth.containing(now);
  return invoicingMomentOf(current).getTime() <= now.getTime() ? current : current.previous();
}

/** Un bon passé au compte, pas encore facturé, avec ce qu'il a figé. */
export interface InvoiceableOrder {
  readonly orderId: string;
  readonly orderNumber: string;
  /** La société qui a commandé — le site, pour un sous-compte. */
  readonly companyId: string;
  readonly placedAt: Date;
  readonly billedCompanyId: string | null;
  readonly frozen: FrozenInvoiceOrder;
}

/** Ce que la facture du mois fera pour UN payeur légal. */
export interface PayerInvoicePlan {
  readonly payerId: string;
  /** Les bons à facturer, dans l'ordre reçu (date de passation). */
  readonly billable: readonly InvoiceableOrder[];
  /** Les bons qu'on ne sait pas facturer : signalés, laissés hors de la facture. */
  readonly unbillable: readonly InvoiceableOrder[];
}

export interface MonthlyInvoicePlan {
  readonly payers: readonly PayerInvoicePlan[];
  /** Les payeurs déjà facturés pour ce mois : rien de neuf pour eux. */
  readonly alreadyInvoiced: readonly string[];
}

/**
 * **Une facture par payeur légal** (Q3) : le principal pour un site qui suit
 * sa facturation — `billedPayerOf`, le même que le relevé et le lot.
 *
 * Un payeur déjà facturé pour ce mois ne l'est pas deux fois : ses bons
 * passés depuis (entre 22h et minuit) attendent la facture du mois suivant.
 * Les payeurs sortent dans l'ordre de leur premier bon.
 */
export function planMonthlyInvoices(
  orders: readonly InvoiceableOrder[],
  follows: readonly BillingFollow[],
  alreadyInvoiced: ReadonlySet<string>,
): MonthlyInvoicePlan {
  const byPayer = new Map<
    string,
    { billable: InvoiceableOrder[]; unbillable: InvoiceableOrder[] }
  >();
  const skipped = new Set<string>();
  for (const order of orders) {
    const payerId = billedPayerOf(order, follows);
    if (alreadyInvoiced.has(payerId)) {
      skipped.add(payerId);
      continue;
    }
    const entry = byPayer.get(payerId) ?? { billable: [], unbillable: [] };
    (isBillable(order.frozen) ? entry.billable : entry.unbillable).push(order);
    byPayer.set(payerId, entry);
  }
  return {
    payers: [...byPayer.entries()].map(([payerId, entry]) => ({ payerId, ...entry })),
    alreadyInvoiced: [...skipped],
  };
}

/**
 * Le moyen de paiement que la facture fige (BG-16) : le prélèvement SEPA
 * quand TOUS ses bons tombent sur le même mandat effectif de cette entité —
 * celui que le lot prendra. Sinon `null` : aucun moyen n'est écrit plutôt
 * qu'un mandat choisi parmi plusieurs.
 */
export function invoicePaymentMeansOf(
  orders: readonly InvoiceableOrder[],
  context: Pick<VerdictContext, "legalEntityId" | "follows" | "mandates" | "collectionForms">,
): InvoicePaymentMeans | null {
  const mandates = orders.map((order) => effectiveMandateOf(order, context));
  const [first] = mandates;
  if (first === undefined || first === null) {
    return null;
  }
  const single = mandates.every((mandate) => mandate?.mandateId === first.mandateId);
  return single ? { code: SEPA_DIRECT_DEBIT, mandateReference: first.reference } : null;
}

/**
 * La date de livraison RÉELLE d'un bon (BT-13 en note), ou `null` : le jour
 * de la tournée qui l'a remis à la porte, sinon le jour (Paris) de son
 * retrait. Jamais la date demandée.
 */
export function deliveredOnOf(
  handover: DossierHandoverFact | null,
  stops: readonly DossierStopFact[],
): string | null {
  if (handover === null) {
    return null;
  }
  return (
    orderHistory(handover, stops).actualDeliveryDay ?? instantToLocal(handover.handedOverAt).day
  );
}
