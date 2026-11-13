import { BANK_CARD, type InvoicePaymentMeans } from "../entities/invoice.types.js";
import type { BillingFollow } from "../ports/statement-billing.reader.js";
import type { FrozenInvoiceOrder } from "./invoice-dossier.types.js";

/**
 * **La facture carte**, sa partie pure (plan
 * `documentation/comptabilite/facturation/facture-carte-et-remboursements.md`) : faut-il facturer cette commande maintenant, et sous
 * quel moyen. Ni horloge, ni port : la commande est donnée.
 */

/** Le règlement d'une commande, tel que l'énumération `PaymentStatus` l'écrit. */
export type CardOrderPaymentStatus = "not_required" | "pending" | "paid" | "failed" | "refunded";

/** Ce qu'il faut savoir d'une commande pour décider de sa facture carte. */
export interface CardInvoiceCandidate {
  readonly orderId: string;
  readonly orderNumber: string;
  /** La société qui a commandé ; `null` : une commande sans société, donc publique. */
  readonly companyId: string | null;
  readonly billedCompanyId: string | null;
  readonly placedAt: Date;
  /** `null` pour une commande d'avant la colonne (§ 2 bis-9). */
  readonly clientele: "pro" | "public" | null;
  readonly cancelled: boolean;
  readonly paymentStatus: CardOrderPaymentStatus;
  /** Le total COMMANDÉ : il dit le régime (gratuit ou pas) et l'argent attendu avant la remise. */
  readonly totalCents: number;
  /**
   * Le total FACTURABLE posé au solde (`orders.billable_total_cents`, lu brut) ;
   * `null` tant que le solde n'est pas posé — la facture attend
   * (`awaiting_settlement`). C'est sur lui que la facture se juge après la remise.
   */
  readonly billableCents: number | null;
  /** L'encaissement (`orders.paid_at`) ; `null` tant que rien n'est encaissé. */
  readonly paidAt: Date | null;
  /** Le retrait constaté ; `null` tant que la commande n'est pas retirée. */
  readonly handedOverAt: Date | null;
  /**
   * La date de réception (`orders.received_on`, `AAAA-MM-JJ`) — posée avec la
   * remise, et pour une remise à la porte le jour de la tournée. `null` tant
   * que la commande n'est pas reçue.
   */
  readonly receivedOn: string | null;
  /** Une facture 380 couvre déjà le bon. */
  readonly invoiced: boolean;
  /**
   * **Encaissé** : la somme des paiements par carte réussis (plan M2, §2), lue
   * à la position du bloc `card-payment`.
   */
  readonly chargedCents: number;
  /** Le cumul des remboursements RÉUSSIS, toute nature — comme avant le plan M2. */
  readonly refundedCents: number;
  /** Le remboursé d'**ajustement** (la baisse, S1) : la facture est sur le montant baissé. */
  readonly adjustmentRefundedCents: number;
  /** Une demande d'ajustement attend son issue (`to_issue`, `issued`). */
  readonly adjustmentPending: boolean;
  /** Une demande d'ajustement est arrêtée : à relancer ou à rendre autrement. */
  readonly adjustmentStopped: boolean;
  /** Les périodes `billing` de la société, pour `billedPayerOf`. */
  readonly follows: readonly BillingFollow[];
  /**
   * Le contenu de la facture : le LIVRÉ (`toBillableInvoiceOrder`) quand le
   * solde est posé ; la commande sinon — jamais émis, le verdict attend.
   */
  readonly frozen: FrozenInvoiceOrder;
  /** Les BL remis, par rang — cités par la ligne de référence (plan E6 § 11). */
  readonly deliveryNoteNumbers: readonly string[];
}

/**
 * Ce que la commande appelle :
 *
 * - `issuable` — pro, encaissée par carte, retirée, pas encore facturée ;
 * - `already_invoiced` — une 380 la couvre déjà (rejeu, ou l'autre déclencheur) ;
 * - `not_card` — publique, au compte, gratuite ou annulée : jamais de facture carte ;
 * - `awaiting_payment` / `awaiting_handover` — l'autre déclencheur viendra ;
 * - `awaiting_settlement` — retirée, mais le solde n'est pas posé : la
 *   facture porte le livré, elle l'attend. `order.billing_settled` la réveille
 *   (`issue-card-invoice-on-billing-settled`) ;
 * - `blocked` — l'argent ne tombe pas juste (plan M2, §6.1, G3) : une
 *   demande d'ajustement attend ou est arrêtée, ou encaissé − remboursé
 *   d'ajustement ≠ total dû (le commandé avant la remise, le facturable
 *   après). Le remboursement réglé réveille la facture
 *   (`issue-card-invoice-on-refund-settled`) ;
 * - `fully_refunded` — les retours et les remboursements hors plateforme
 *   couvrent le facturable : pas de vente. Un AJUSTEMENT n'y compte pas : il
 *   rend un trop-perçu, il n'annule rien de ce qui a été vendu.
 */
export type CardInvoiceVerdict =
  | "issuable"
  | "already_invoiced"
  | "not_card"
  | "awaiting_payment"
  | "awaiting_handover"
  | "awaiting_settlement"
  | "blocked"
  | "fully_refunded";

/** Les règlements d'une commande ENCAISSÉE par carte : le régime `paid`. */
const CARD_SETTLED: ReadonlySet<CardOrderPaymentStatus> = new Set(["paid", "refunded"]);
/** Une carte attendue ou à reprendre : le régime `due`. */
const CARD_DUE: ReadonlySet<CardOrderPaymentStatus> = new Set(["pending", "failed"]);

/** Ce qui suffit à dire qu'une commande n'appelle JAMAIS de facture carte. */
export type CardInvoiceScope = Pick<
  CardInvoiceCandidate,
  "companyId" | "clientele" | "cancelled" | "totalCents" | "paymentStatus"
>;

/**
 * **Hors de la facture carte, pour toujours** : sans société (publique,
 * `clientele` nul compris, § 2 bis-9), publique, annulée, gratuite, ou au
 * compte (`not_required`). Lu par le verdict (`not_card`) et par le réveil au
 * solde, qui écarte ainsi une commande au compte ou d'un particulier sans
 * verrou ni lecture d'argent.
 */
export function outsideCardInvoicing(scope: CardInvoiceScope): boolean {
  return (
    scope.companyId === null ||
    scope.clientele === "public" ||
    scope.cancelled ||
    scope.totalCents <= 0 ||
    scope.paymentStatus === "not_required"
  );
}

/**
 * **Le verdict** (§ 2 bis-1, -9 ; A10 ; plan E9, lot F, § 3.2). L'ordre est la
 * règle : le premier qui répond gagne.
 *
 * La lecture du règlement est la traduction de `settlementRegimeOf`
 * (`lafoliecoffee/orders/domain/services/settlement-regime.ts`, vérifié le 2026-10-08) :
 * `not_required` est le compte ou la gratuité, `pending`/`failed` la carte
 * attendue, `paid`/`refunded` la carte encaissée. Les deux changent ensemble.
 *
 * Avant la remise, l'argent se juge au COMMANDÉ ; après, au FACTURABLE du
 * solde — la facture porte le livré.
 */
export function cardInvoiceVerdict(candidate: CardInvoiceCandidate): CardInvoiceVerdict {
  if (candidate.invoiced) {
    return "already_invoiced";
  }
  if (outsideCardInvoicing(candidate)) {
    return "not_card";
  }
  if (CARD_DUE.has(candidate.paymentStatus) || candidate.paidAt === null) {
    return "awaiting_payment";
  }
  if (candidate.handedOverAt === null) {
    return moneySquares(candidate, candidate.totalCents) ? "awaiting_handover" : "blocked";
  }
  const billable = candidate.billableCents;
  if (billable === null) {
    return "awaiting_settlement";
  }
  if (!moneySquares(candidate, billable)) {
    return "blocked";
  }
  if (!CARD_SETTLED.has(candidate.paymentStatus)) {
    return "not_card";
  }
  const unsold = candidate.refundedCents - candidate.adjustmentRefundedCents;
  return unsold >= billable ? "fully_refunded" : "issuable";
}

/**
 * **L'égalité G3** (plan M2, §2, §6.1) : rien d'ajustement en attente ni
 * arrêté, et encaissé − remboursé d'ajustement = `base` (le commandé avant la
 * remise, le facturable après). « Réglé autrement » y est compté : sa ligne
 * `manual` est un remboursé d'ajustement. Un remboursement de nature `return`
 * n'y entre pas : il dit que la vente n'a pas lieu, et c'est `fully_refunded`
 * qui le lit.
 */
function moneySquares(candidate: CardInvoiceCandidate, base: number): boolean {
  return (
    !candidate.adjustmentPending &&
    !candidate.adjustmentStopped &&
    candidate.chargedCents - candidate.adjustmentRefundedCents === base
  );
}

/** La phrase d'une facture carte qui attend que l'argent tombe juste (`blocked`). */
export const CARD_INVOICE_AWAITS_REFUND =
  "L'argent de cette commande ne tombe pas encore juste : un remboursement d'ajustement est en cours ou arrêté, ou l'encaissé diffère du total. La facture partira quand il sera rendu.";

/** La phrase d'une facture carte retirée dont le solde n'est pas posé (`awaiting_settlement`). */
export const CARD_INVOICE_AWAITS_SETTLEMENT =
  "La facture attend que le solde de la commande soit posé (remise complète et jour de réception) ; elle partira seule au solde.";

/** Le moyen d'une facture carte (BG-16) — le code seul. */
export const CARD_PAYMENT_MEANS: InvoicePaymentMeans = { code: BANK_CARD };

/**
 * L'échéance d'une facture acquittée : le jour du paiement (§ 2 bis-4) —
 * mais jamais avant l'émission, qu'interdisent l'agrégat et la base. Une
 * commande payée avant d'être retirée porte donc l'échéance du jour
 * d'émission (cf. § 11 du plan : la contradiction est remontée).
 */
export function cardInvoiceDueOn(paidOn: string, issuedOn: string): string {
  return paidOn >= issuedOn ? paidOn : issuedOn;
}
