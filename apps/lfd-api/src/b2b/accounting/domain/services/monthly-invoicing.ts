import { instantToLocal } from "@lfd/contracts";

import { SEPA_DIRECT_DEBIT, type InvoicePaymentMeans } from "../entities/invoice.types.js";
import type { CollectionMandate } from "../ports/collection-mandates.reader.js";
import type { BillingFollow } from "../ports/statement-billing.reader.js";
import { billedPayerOf } from "./billed-payer.js";
import { effectiveMandateOf, type VerdictContext } from "./collection-verdict.js";
import type { DossierHandoverFact, DossierStopFact } from "./invoice-dossier-history.js";
import { orderHistory } from "./invoice-dossier-history.js";
import { isBillable } from "./invoice-billability.js";
import type { FrozenInvoiceOrder } from "./invoice-dossier.types.js";

/**
 * **La facture du mois**, sa partie pure (plan
 * `documentation/comptabilite/facturation/facture-emise.md`) :
 * qui elle facture, sous quel moyen.
 *
 * Ni horloge, ni port : l'instant et les bons sont donnés.
 */

// Quand elle s'émet et quelle période elle ferme : `invoicing-closures.ts`
// (R3, la période est une clôture du rythme de l'entité).

/** Un bon passé au compte, pas encore facturé, avec ce qu'il a figé. */
export interface InvoiceableOrder {
  readonly orderId: string;
  readonly orderNumber: string;
  /** La société qui a commandé — le site, pour un sous-compte. */
  readonly companyId: string;
  readonly placedAt: Date;
  /**
   * `AAAA-MM-JJ` — `orders.received_on`, le jour qui l'a fait entrer dans
   * l'assiette (lot ZL). Jamais `null` sous `billableOrderWhere` ; le type le
   * garde nullable pour que le bloqueur M5 reste un filet.
   */
  readonly receivedOn: string | null;
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
  /** Les factures (clés `invoiceGroupKey`) déjà émises pour cette période : rien de neuf pour elles. */
  readonly alreadyInvoiced: readonly string[];
}

/** Ce qu'il faut pour trouver le mandat effectif d'un bon — la règle du lot. */
export type MandateContext = Pick<
  VerdictContext,
  "legalEntityId" | "follows" | "mandates" | "collectionForms"
>;

/**
 * La clé d'une facture dans sa période (clôture) : le payeur ET le mandat
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
 * premier bon de chacune. Une facture déjà émise pour cette clôture ne
 * l'est pas deux fois : ses bons passés depuis (entre 23h55 et minuit)
 * attendent la facture de la période suivante.
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

/**
 * **Le groupe d'une facture, moins ses commandes annulées** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C5.3), relu sous le verrou des
 * lignes `orders` du groupe. On retire, rien d'autre : le mandat effectif se
 * calcule bon par bon (`effectiveMandateOf`), retirer un bon ne change donc
 * ni le mandat ni la clé des autres — replanifier rendrait le même groupe.
 * `null` : plus aucun bon, rien à émettre ni à signaler.
 *
 * Par NUMÉRO de commande : c'est ce que rend `CancelledOrdersReader`, écrit
 * pour nommer le refus du dépôt (vérifié le 2026-10-12) ; un numéro est
 * unique.
 */
export function withoutCancelled(
  group: PayerInvoicePlan,
  cancelledNumbers: ReadonlySet<string>,
): PayerInvoicePlan | null {
  const live = (order: InvoiceableOrder): boolean => !cancelledNumbers.has(order.orderNumber);
  const billable = group.billable.filter(live);
  const unbillable = group.unbillable.filter(live);
  if (billable.length === 0 && unbillable.length === 0) {
    return null;
  }
  return { ...group, billable, unbillable };
}

/** Tous les bons d'un groupe — ceux que l'émission verrouille. */
export function groupOrderIds(group: PayerInvoicePlan): readonly string[] {
  return [...group.billable, ...group.unbillable].map((order) => order.orderId);
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
export function receivedOnOf(
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

/**
 * **Le jour de réception d'une commande remise** — jamais `null`. La règle
 * {@link receivedOnOf}, sinon le jour (Paris) de l'instant de la remise.
 *
 * Son seul écrivain est la remise (plan
 * `documentation/commandes/la-commande/date-de-reception.md`, B2,
 * `MarkOrderFulfilledHandler`, l'instant du fait) ; la reprise du §8 a été
 * faite par la migration de B4, par la règle simple. Le repli couvre une
 * remise qu'aucune attestation de retrait n'accompagne : elle a eu lieu, elle
 * a donc un jour (Hugo, 2026-10-24).
 */
export function receivedOnOrDayOf(
  handover: DossierHandoverFact | null,
  stops: readonly DossierStopFact[],
  handedOverAt: Date,
): string {
  return receivedOnOf(handover, stops) ?? instantToLocal(handedOverAt).day;
}
