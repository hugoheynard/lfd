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
 * **Les clés des natures d'une demande de paiement libre** — pourquoi on
 * demande cette somme. Une clé stable : écrite en base, reprise au journal.
 * Un `z.enum` sur elles, pour que le catalogue du journal voie les valeurs.
 * Une nature de plus est une clé ici et son libellé ci-dessous : la colonne
 * n'a pas de `CHECK`. Une nature ne se retire jamais (une ligne qui la porte
 * doit rester lisible). L'acompte en nature encaisse seulement : sa facture
 * et sa déduction attendent un type de sujet à lui.
 */
export const freeChargeNatureSchema = z.enum([
  "regularization",
  "agreed_supplement",
  "balance_after_dispute",
  "deposit",
  "other",
]);

/** Une clé du registre des natures. */
export type FreeChargeNature = z.infer<typeof freeChargeNatureSchema>;

const NATURE_LABELS: Readonly<Record<FreeChargeNature, string>> = {
  regularization: "Régularisation",
  agreed_supplement: "Supplément convenu",
  balance_after_dispute: "Solde après litige",
  deposit: "Acompte",
  other: "Autre",
};

/** **Le registre des natures**, dans l'ordre de l'écran : la clé et son libellé. */
export const FREE_CHARGE_NATURES: readonly {
  readonly key: FreeChargeNature;
  readonly label: string;
}[] = freeChargeNatureSchema.options.map((key) => ({ key, label: NATURE_LABELS[key] }));

/** Vrai si `value` est une clé du registre des natures. */
export function isFreeChargeNature(value: unknown): value is FreeChargeNature {
  return freeChargeNatureSchema.safeParse(value).success;
}

/** Le libellé d'une nature, tel que l'écran et l'avis à la comptabilité le disent. */
export function freeChargeNatureLabel(nature: FreeChargeNature): string {
  return NATURE_LABELS[nature];
}

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
