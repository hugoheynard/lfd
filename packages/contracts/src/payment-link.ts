import { z } from "zod";

import type { OrderStatus } from "./order.js";

/**
 * **Les liens de paiement** — ce que la comptabilité lit et envoie pour faire
 * régler un client par carte. Plan
 * `documentation/payment/liens-de-paiement/les-liens-de-paiement.md`
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

/**
 * **Le registre des natures d'une demande de paiement libre** — pourquoi on
 * demande cette somme, quand le paiement n'a pas d'autre conséquence que
 * d'être encaissé. Une clé stable (écrite en base, reprise au journal) et son
 * libellé, dans l'ordre de l'écran. Une nature de plus est une ligne ici : la
 * colonne n'a pas de `CHECK`, le domaine refuse une clé absente du registre.
 * Une raison qui a une conséquence (l'acompte) est un type de sujet à part,
 * jamais une nature.
 */
export const FREE_CHARGE_NATURES = [
  { key: "regularization", label: "Régularisation" },
  { key: "agreed_supplement", label: "Supplément convenu" },
  { key: "balance_after_dispute", label: "Solde après litige" },
  { key: "deposit", label: "Acompte" },
  { key: "other", label: "Autre" },
] as const;

/** Une clé du registre {@link FREE_CHARGE_NATURES}. */
export type FreeChargeNature = (typeof FREE_CHARGE_NATURES)[number]["key"];

/** Vrai si `value` est une clé du registre des natures. */
export function isFreeChargeNature(value: unknown): value is FreeChargeNature {
  return FREE_CHARGE_NATURES.some((nature) => nature.key === value);
}

/** Le libellé d'une nature, tel que l'écran et l'avis à la comptabilité le disent. */
export function freeChargeNatureLabel(nature: FreeChargeNature): string {
  return FREE_CHARGE_NATURES.find((entry) => entry.key === nature)?.label ?? nature;
}

/** La forme d'une nature dans une charge utile : une clé du registre. */
export const freeChargeNatureSchema = z.custom<FreeChargeNature>(isFreeChargeNature, {
  message: `Nature inconnue : attendu une de ${FREE_CHARGE_NATURES.map((n) => n.key).join(", ")}.`,
});

/** Les bornes du libellé repris sur la page de paiement. */
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
  /** La nature choisie à la création ; `null` pour une demande d'avant le registre. */
  readonly nature: FreeChargeNature | null;
  readonly status: PaymentLinkStatus;
  /**
   * L'adresse à copier et envoyer au client, **tant que le lien est ouvert** :
   * la page de paiement La Folie Coffee (`/payer/…`) pour un lien neuf, la page
   * Stripe pour un lien d'avant la porte. `null` pour un lien payé, annulé ou
   * expiré — il n'y a plus rien à envoyer —, et pour un lien ouvert dont
   * l'adresse ne peut pas être composée (racine publique absente) : l'écran ne
   * propose « Copier » qu'avec une adresse.
   */
  readonly url: string | null;
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
  nature: freeChargeNatureSchema,
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
