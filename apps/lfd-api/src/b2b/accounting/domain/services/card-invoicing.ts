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
  readonly totalCents: number;
  /** L'encaissement (`orders.paid_at`) ; `null` tant que rien n'est encaissé. */
  readonly paidAt: Date | null;
  /** Le retrait constaté ; `null` tant que la commande n'est pas retirée. */
  readonly handedOverAt: Date | null;
  /** Une facture 380 couvre déjà le bon. */
  readonly invoiced: boolean;
  /** Le cumul des remboursements RÉUSSIS. */
  readonly refundedCents: number;
  /** Les périodes `billing` de la société, pour `billedPayerOf`. */
  readonly follows: readonly BillingFollow[];
  readonly frozen: FrozenInvoiceOrder;
}

/**
 * Ce que la commande appelle :
 *
 * - `issuable` — pro, encaissée par carte, retirée, pas encore facturée ;
 * - `already_invoiced` — une 380 la couvre déjà (rejeu, ou l'autre déclencheur) ;
 * - `not_card` — publique, au compte, gratuite ou annulée : jamais de facture carte ;
 * - `awaiting_payment` / `awaiting_handover` — l'autre déclencheur viendra ;
 * - `fully_refunded` — remboursée en totalité avant d'être facturée (A10) :
 *   pas de livraison, pas de vente.
 */
export type CardInvoiceVerdict =
  | "issuable"
  | "already_invoiced"
  | "not_card"
  | "awaiting_payment"
  | "awaiting_handover"
  | "fully_refunded";

/** Les règlements d'une commande ENCAISSÉE par carte : le régime `paid`. */
const CARD_SETTLED: ReadonlySet<CardOrderPaymentStatus> = new Set(["paid", "refunded"]);
/** Une carte attendue ou à reprendre : le régime `due`. */
const CARD_DUE: ReadonlySet<CardOrderPaymentStatus> = new Set(["pending", "failed"]);

/**
 * **Le verdict** (§ 2 bis-1, -9 ; A10).
 *
 * La lecture du règlement est la traduction de `settlementRegimeOf`
 * (`b2b/orders/domain/services/settlement-regime.ts`, vérifié le 2026-10-08) :
 * `not_required` est le compte ou la gratuité, `pending`/`failed` la carte
 * attendue, `paid`/`refunded` la carte encaissée. Les deux changent ensemble.
 *
 * Une commande sans société est publique, `clientele` nul compris (§ 2 bis-9).
 */
export function cardInvoiceVerdict(candidate: CardInvoiceCandidate): CardInvoiceVerdict {
  if (candidate.invoiced) {
    return "already_invoiced";
  }
  if (
    candidate.companyId === null ||
    candidate.clientele === "public" ||
    candidate.cancelled ||
    candidate.totalCents <= 0 ||
    candidate.paymentStatus === "not_required"
  ) {
    return "not_card";
  }
  if (CARD_DUE.has(candidate.paymentStatus) || candidate.paidAt === null) {
    return "awaiting_payment";
  }
  if (candidate.handedOverAt === null) {
    return "awaiting_handover";
  }
  if (!CARD_SETTLED.has(candidate.paymentStatus)) {
    return "not_card";
  }
  return candidate.refundedCents >= candidate.totalCents ? "fully_refunded" : "issuable";
}

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
