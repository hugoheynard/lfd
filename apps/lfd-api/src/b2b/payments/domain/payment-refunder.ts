import type { PaymentRefundStatus } from "./payment-gateway.js";

/**
 * Ce qu'on demande au prestataire pour rendre l'argent d'une commande (plan
 * `documentation/order/plan-annulation-de-commande.md`, C4.7).
 *
 * Aucun montant : le prestataire rend ce qui RESTE remboursable sur
 * l'intention, jamais plus (C4.4) — c'est la dernière défense contre un
 * sur-remboursement, et elle est chez lui, par construction de l'appel.
 */
export interface RefundRequestParams {
  readonly paymentIntentId: string;
  /** `lfd-order-refund:<orderId>:<generation>:<round>` — la clé d'idempotence. */
  readonly key: string;
  /** La demande (= l'id de la commande), posée en métadonnée et filtrée par la recherche. */
  readonly requestId: string;
  /** La génération courante : seul un `re_…` de CETTE génération est retenu. */
  readonly generation: number;
}

/** Un remboursement tel que le prestataire le rend. `createdAt` est SON instant. */
export interface IssuedRefund {
  readonly refundId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: PaymentRefundStatus;
  readonly createdAt: Date;
}

/**
 * L'issue d'une demande de remboursement — **jamais une exception** (comme
 * `cancelIntent`) : chacune appelle un geste différent de l'exécuteur.
 *
 * - `issued` — un `re_…` existe pour cette génération (trouvé ou créé) ;
 * - `nothing_left` — le prestataire dit tout déjà rendu ;
 * - `declined` — refus définitif (litige…) : rejouer ne changerait rien ;
 * - `unavailable` — réseau, 5xx, 429, clé déjà en cours, canal non
 *   configuré : `reason` va au journal technique, jamais à un client.
 */
export type RefundIssuance =
  | { readonly kind: "issued"; readonly refund: IssuedRefund }
  | { readonly kind: "nothing_left" }
  | { readonly kind: "declined"; readonly code: string }
  | { readonly kind: "unavailable"; readonly reason: string };

/** L'issue d'une recherche seule : trouvé, rien, ou pas de réponse. */
export type RefundLookup =
  | { readonly kind: "found"; readonly refund: IssuedRefund }
  | { readonly kind: "none" }
  | { readonly kind: "unavailable"; readonly reason: string };

/**
 * Port du **remboursement chez le prestataire** (lot C4).
 *
 * À part de `PaymentGateway`, et c'est voulu (ISP) : le seul consommateur est
 * l'exécuteur des remboursements, et la passerelle d'encaissement est doublée
 * par une cinquantaine de suites e2e qui n'ont rien à rembourser (compté le
 * 2026-10-12).
 *
 * 🔴 Ne s'appelle JAMAIS sous une transaction ni sous un verrou de base.
 */
export abstract class PaymentRefunder {
  /**
   * Cherche d'abord un `re_…` de cette demande et de cette génération, ni
   * `failed` ni `canceled` ; sinon le crée sous la clé, sans montant.
   */
  abstract refundRemainder(params: RefundRequestParams): Promise<RefundIssuance>;

  /** La recherche seule, même filtre — pour relire après un `nothing_left`. */
  abstract findRefund(params: RefundRequestParams): Promise<RefundLookup>;
}
