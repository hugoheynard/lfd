import { instantToLocal } from "@lfd/contracts";

import {
  SEPA_CREDIT_TRANSFER,
  SEPA_DIRECT_DEBIT,
  type InvoiceFreeDelivery,
  type InvoicePaymentMeans,
} from "../entities/invoice.types.js";
import type { CollectionMandate } from "../ports/collection-mandates.reader.js";
import type { BillingFollow } from "../ports/statement-billing.reader.js";
import { billedPayerOf } from "./billed-payer.js";
import { effectiveMandateOf, type VerdictContext } from "./collection-verdict.js";
import type { DossierHandoverFact, DossierStopFact } from "./invoice-dossier-history.js";
import { orderHistory } from "./invoice-dossier-history.js";
import { isBillable } from "./invoice-billability.js";
import type { FrozenInvoiceOrder } from "./invoice-dossier.types.js";
import type { CollectionMeans } from "../value-objects/collection-means.js";
import type { InvoiceBudgetCommitment } from "../value-objects/invoice-budget-commitment.js";

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
   * `AAAA-MM-JJ` — `orders.received_on`, la première remise : la date de
   * livraison que la facture imprime. L'assiette lit le jour du SOLDE
   * (`settled_on`, E6c2) ; le type garde ce jour nullable pour que le
   * bloqueur M5 reste un filet.
   */
  readonly receivedOn: string | null;
  readonly billedCompanyId: string | null;
  readonly frozen: FrozenInvoiceOrder;
  /** Les BL remis, par rang — cités par la ligne de référence de la facture. */
  readonly deliveryNoteNumbers: readonly string[];
  /**
   * La livraison offerte figée sur la commande, que la facture fige à son
   * tour (plan livraison offerte, § 2.9). Absente = rien d'offert.
   */
  readonly freeDelivery?: InvoiceFreeDelivery;
  /**
   * Remis mais pas soldé (plan E6c2, § 1, relecture de `vitruve`). Absent = soldé.
   *
   * - `awaiting_remainder` — un reste est encore à livrer (décision « à
   *   relivrer », ou un BL ni remis ni annulé) : ATTENDU, pas anormal. Écarté
   *   de la facture et signalé avec les bons hors facture ; il part au mois
   *   de son solde (Q-E6-3).
   * - `unsettled` — rien n'est en attente et pourtant le solde manque : une
   *   anomalie. La facture de son payeur ne part pas, le bloqueur la nomme.
   */
  readonly settlement?: "awaiting_remainder" | "unsettled";
  /**
   * L'engagement budgétaire que la commande porte (organisme public, P2) ;
   * `null` sans engagement — tout payeur privé. Il entre dans la clé de la
   * facture : deux engagements, deux factures.
   */
  readonly budgetCommitment: InvoiceBudgetCommitment | null;
}

/** Les bons du mois d'UN payeur légal, dans l'ordre reçu (date de passation). */
export interface PayerOrders {
  readonly payerId: string;
  readonly orders: readonly InvoiceableOrder[];
}

/**
 * **UNE facture du mois** : un payeur légal, un mandat effectif (ou aucun),
 * un engagement budgétaire (ou aucun, P2), et les bons qui tombent dessus
 * (E4b, option b).
 */
export interface PayerInvoicePlan {
  readonly payerId: string;
  /**
   * Le moyen de la période du payeur (K10) — celui que la facture fige. Au
   * virement, aucun mandat : une seule facture, `mandate` vaut `null`.
   */
  readonly means: CollectionMeans;
  /** Le mandat effectif de tous ses bons ; `null` : aucun mandat unique. */
  readonly mandate: CollectionMandate | null;
  /** L'engagement de tous ses bons (P2) ; `null` : aucun. */
  readonly budgetCommitment: InvoiceBudgetCommitment | null;
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

/**
 * Ce qu'il faut pour trouver le mandat effectif d'un bon — la règle du lot —,
 * et le moyen de la période de chaque payeur (K3, K10).
 */
export type MandateContext = Pick<
  VerdictContext,
  "legalEntityId" | "follows" | "mandates" | "collectionForms" | "collectionMeansOf"
>;

/**
 * La clé d'une facture dans sa période (clôture) : le payeur, le mandat
 * effectif (`null` = aucun), le numéro d'engagement et le code service (P2,
 * E4′ — `null` = aucun). C'est elle qui dit « déjà facturé ». Un payeur privé
 * n'a jamais d'engagement : il garde le découpage par (payeur, mandat).
 */
export function invoiceGroupKey(
  payerId: string,
  mandateId: string | null,
  commitment: InvoiceBudgetCommitment | null,
): string {
  const base = `${payerId}|${mandateId ?? ""}`;
  // Sans engagement, la clé d'avant P2, au caractère près. L'engagement est
  // saisi par une personne : sérialisé, un `|` dans le numéro ne confond pas
  // deux clés.
  return commitment === null || (commitment.number === "" && commitment.serviceCode === "")
    ? base
    : `${base}|${JSON.stringify([commitment.number, commitment.serviceCode])}`;
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
 * effectif font la leur, sans moyen de paiement — comme avant E4b. Un payeur
 * dont la période est au virement (K10) a UNE facture, sans mandat : la clé
 * est celle d'une facture sans mandat (K7 — les deux ne coexistent pas sur
 * une même clôture, une période n'ayant qu'un moyen).
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
    for (const group of byInvoiceKey(payer, context)) {
      const key = invoiceGroupKey(
        group.payerId,
        group.mandate?.mandateId ?? null,
        group.budgetCommitment,
      );
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
 * Les bons d'un payeur rangés par mandat effectif et par engagement (P2),
 * dans l'ordre du premier bon. Au virement, `effectiveMandateOf` rend `null`
 * pour tous ; sans engagement (tout payeur privé), un seul groupe par mandat.
 */
function byInvoiceKey(payer: PayerOrders, context: MandateContext): readonly PayerInvoicePlan[] {
  const means = context.collectionMeansOf(payer.payerId);
  const groups = new Map<
    string,
    {
      mandate: CollectionMandate | null;
      budgetCommitment: InvoiceBudgetCommitment | null;
      billable: InvoiceableOrder[];
      unbillable: InvoiceableOrder[];
    }
  >();
  for (const order of payer.orders) {
    const mandate = effectiveMandateOf(order, context);
    const { budgetCommitment } = order;
    const key = invoiceGroupKey(payer.payerId, mandate?.mandateId ?? null, budgetCommitment);
    const group = groups.get(key) ?? { mandate, budgetCommitment, billable: [], unbillable: [] };
    const held = order.settlement === "awaiting_remainder";
    (!held && isBillable(order.frozen) ? group.billable : group.unbillable).push(order);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({ payerId: payer.payerId, means, ...group }));
}

/**
 * Le moyen de paiement que la facture fige (BG-16, K10) : le virement pour
 * une période au virement ; sinon le prélèvement SEPA sous le mandat
 * effectif de ses bons — celui que le lot prendra. Sans mandat, `null` :
 * aucun moyen n'est écrit, et le lot la lit « prélèvement ».
 */
export function invoicePaymentMeansOf(
  invoice: Pick<PayerInvoicePlan, "means"> & {
    readonly mandate: Pick<CollectionMandate, "reference"> | null;
  },
): InvoicePaymentMeans | null {
  if (invoice.means === "bank_transfer") {
    return { code: SEPA_CREDIT_TRANSFER };
  }
  return invoice.mandate === null
    ? null
    : { code: SEPA_DIRECT_DEBIT, mandateReference: invoice.mandate.reference };
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
