import { addDays, instantToLocal, localToInstant } from "@lfd/contracts";

import { SEPA_DIRECT_DEBIT, type InvoicePaymentMeans } from "../entities/invoice.types.js";
import { BillingCycleBoundaryError } from "../errors/accounting-errors.js";
import type { CollectionMandate } from "../ports/collection-mandates.reader.js";
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

/**
 * L'heure de l'émission, le dernier jour du mois, à Paris (§ 4) — 23h55
 * depuis E4b (Hugo, 2026-10-08) : les bons du soir restent sur leur mois.
 * Cinq minutes avant minuit, la plus petite fenêtre que le cron
 * (`55 21,22 * * *`, UTC) tient en heure d'été comme d'hiver ; un bon passé
 * entre 23h55 et minuit va à la facture du mois suivant (arbitré).
 */
export const MONTHLY_INVOICE_TIME = "23:55";

/** Le dernier jour (local) d'un mois — la date d'émission de ses factures. */
export function lastDayOf(month: StatementMonth): string {
  return addDays(instantToLocal(month.cycle().closesAt).day, -1);
}

/**
 * L'instant à partir duquel les factures d'un mois s'émettent : son dernier
 * jour à 23h55, heure de Paris.
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
 * d'émission est passé — le mois courant à partir de son dernier jour 23h55,
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

/** Les bons du mois d'UN payeur légal, dans l'ordre reçu (date de passation). */
export interface PayerOrders {
  readonly payerId: string;
  readonly orders: readonly InvoiceableOrder[];
}

/**
 * **UNE facture du mois** : un payeur légal, un mandat effectif (ou aucun),
 * et les bons qui tombent dessus (E4b, option b).
 */
export interface PayerInvoicePlan {
  readonly payerId: string;
  /** Le mandat effectif de tous ses bons ; `null` : aucun mandat unique. */
  readonly mandate: CollectionMandate | null;
  /** Les bons à facturer, dans l'ordre reçu (date de passation). */
  readonly billable: readonly InvoiceableOrder[];
  /** Les bons qu'on ne sait pas facturer : signalés, laissés hors de la facture. */
  readonly unbillable: readonly InvoiceableOrder[];
}

export interface MonthlyInvoicePlan {
  readonly invoices: readonly PayerInvoicePlan[];
  /** Les factures (clés `invoiceGroupKey`) déjà émises pour ce mois : rien de neuf pour elles. */
  readonly alreadyInvoiced: readonly string[];
}

/** Ce qu'il faut pour trouver le mandat effectif d'un bon — la règle du lot. */
export type MandateContext = Pick<
  VerdictContext,
  "legalEntityId" | "follows" | "mandates" | "collectionForms"
>;

/**
 * La clé d'une facture du mois dans son mois : le payeur ET le mandat
 * effectif (`null` = aucun). C'est elle qui dit « déjà facturé ».
 */
export function invoiceGroupKey(payerId: string, mandateId: string | null): string {
  return `${payerId}|${mandateId ?? ""}`;
}

/**
 * Les bons par payeur légal (Q3) : le principal pour un site qui suit sa
 * facturation — `billedPayerOf`, le même que le relevé et le lot. Les
 * payeurs sortent dans l'ordre de leur premier bon.
 */
export function ordersByPayer(
  orders: readonly InvoiceableOrder[],
  follows: readonly BillingFollow[],
): readonly PayerOrders[] {
  const byPayer = new Map<string, InvoiceableOrder[]>();
  for (const order of orders) {
    const payerId = billedPayerOf(order, follows);
    byPayer.set(payerId, [...(byPayer.get(payerId) ?? []), order]);
  }
  return [...byPayer.entries()].map(([payerId, payerOrders]) => ({
    payerId,
    orders: payerOrders,
  }));
}

/**
 * **Une facture par payeur légal ET par mandat effectif** (E4b, option b,
 * Hugo 2026-10-08) : les bons d'un payeur qui tombent sur deux mandats
 * (sites sur leur propre mandat, formes 2 et 3) font deux factures, chacune
 * encaissée par la ligne de lot de son mandat. Les bons sans mandat
 * effectif font la leur, sans moyen de paiement — comme avant E4b.
 *
 * Ordre déterministe, donc numérotation aussi : les payeurs dans l'ordre de
 * leur premier bon, puis, chez un payeur, ses factures dans l'ordre du
 * premier bon de chacune. Une facture déjà émise pour ce mois ne l'est pas
 * deux fois : ses bons passés depuis (entre 23h55 et minuit) attendent la
 * facture du mois suivant.
 */
export function planMonthlyInvoices(
  payers: readonly PayerOrders[],
  context: MandateContext,
  alreadyInvoiced: ReadonlySet<string>,
): MonthlyInvoicePlan {
  const invoices: PayerInvoicePlan[] = [];
  const skipped = new Set<string>();
  for (const payer of payers) {
    for (const group of byMandate(payer, context)) {
      const key = invoiceGroupKey(group.payerId, group.mandate?.mandateId ?? null);
      if (alreadyInvoiced.has(key)) {
        skipped.add(key);
      } else {
        invoices.push(group);
      }
    }
  }
  return { invoices, alreadyInvoiced: [...skipped] };
}

/** Les bons d'un payeur rangés par mandat effectif, dans l'ordre du premier bon. */
function byMandate(payer: PayerOrders, context: MandateContext): readonly PayerInvoicePlan[] {
  const groups = new Map<
    string,
    {
      mandate: CollectionMandate | null;
      billable: InvoiceableOrder[];
      unbillable: InvoiceableOrder[];
    }
  >();
  for (const order of payer.orders) {
    const mandate = effectiveMandateOf(order, context);
    const key = mandate?.mandateId ?? "";
    const group = groups.get(key) ?? { mandate, billable: [], unbillable: [] };
    (isBillable(order.frozen) ? group.billable : group.unbillable).push(order);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({ payerId: payer.payerId, ...group }));
}

/**
 * Le moyen de paiement que la facture fige (BG-16) : le prélèvement SEPA
 * sous le mandat effectif de ses bons — celui que le lot prendra. Sans
 * mandat, `null` : aucun moyen n'est écrit.
 */
export function invoicePaymentMeansOf(
  mandate: Pick<CollectionMandate, "reference"> | null,
): InvoicePaymentMeans | null {
  return mandate === null ? null : { code: SEPA_DIRECT_DEBIT, mandateReference: mandate.reference };
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
