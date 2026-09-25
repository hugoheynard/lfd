import { z } from "zod";

import type { OrderStatus } from "./order.js";

/**
 * **Les liens de paiement** — ce que la comptabilité lit et envoie pour faire
 * régler un client par carte. Plan
 * `documentation/comptabilite/plan-blocage-prelevement-et-liens-de-paiement.md` §2.
 */

/**
 * Une commande **à régler par carte** (§2a) : règlement `pending` ou `failed`,
 * non annulée.
 *
 * `paymentUrl` vaut `null` quand l'espace client n'a pas d'adresse publique
 * (`CLIENT_BASE_URL` absente) : l'écran n'affiche alors pas de lien, et le
 * renvoi par e-mail est refusé en le disant.
 */
export interface OrderAwaitingPaymentView {
  readonly orderId: string;
  /** Le numéro de commande, dictable. */
  readonly reference: string;
  /** `null` = commande personnelle, sans société. */
  readonly companyId: string | null;
  readonly companyName: string | null;
  readonly totalCents: number;
  /** ISO — l'instant de la passation. */
  readonly placedAt: string;
  readonly status: OrderStatus;
  readonly paymentStatus: "pending" | "failed";
  readonly paymentUrl: string | null;
}

/** L'état d'un lien libre. `open` est le seul dont on sort. */
export const paymentLinkStatusSchema = z.enum(["open", "paid", "cancelled", "expired"]);
export type PaymentLinkStatus = z.infer<typeof paymentLinkStatusSchema>;

/** Les bornes du libellé repris sur la page Stripe. */
export const PAYMENT_LINK_LABEL_MAX = 140;

/**
 * Un **lien de paiement libre** (§2b) — une somme demandée hors commande.
 * Les auteurs sont nommés par l'annuaire à la lecture ; `null` quand la fiche
 * n'y est plus, jamais un nom inventé.
 */
export interface PaymentLinkView {
  readonly id: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly amountCents: number;
  readonly label: string;
  readonly status: PaymentLinkStatus;
  /** L'URL hébergée par Stripe, à copier. */
  readonly url: string;
  /** ISO. */
  readonly createdAt: string;
  readonly createdByName: string | null;
  /** ISO, `null` tant que Stripe n'a pas confirmé. */
  readonly paidAt: string | null;
  /** ISO. */
  readonly cancelledAt: string | null;
  readonly cancelledByName: string | null;
}

/**
 * Créer un lien libre. Le montant arrive **déjà en centimes** : l'écran
 * convertit les euros saisis. La forme est validée ici ; la règle (plafond,
 * longueur) par l'agrégat.
 */
export const createPaymentLinkPayloadSchema = z.object({
  companyId: z.string().trim().min(1),
  amountCents: z.int().positive(),
  label: z.string().trim().min(1).max(PAYMENT_LINK_LABEL_MAX),
});
export type CreatePaymentLinkPayload = z.infer<typeof createPaymentLinkPayloadSchema>;

/** Ce que rend la création : de quoi afficher l'URL à copier sans relire la liste. */
export interface CreatedPaymentLink {
  readonly id: string;
  readonly url: string;
}

/**
 * Les réglages de la comptabilité. `paymentLinkMaxCents: null` = aucun plafond.
 */
export interface AccountingSettingsView {
  readonly paymentLinkMaxCents: number | null;
}

export const setAccountingSettingsPayloadSchema = z.object({
  paymentLinkMaxCents: z.int().positive().nullable(),
});
export type SetAccountingSettingsPayload = z.infer<typeof setAccountingSettingsPayloadSchema>;
