import {
  IN_HOUSE_OFFER_NATURE,
  ORDER_OFFER_NATURES,
  ORDER_OFFER_NOTE_MAX_LENGTH,
  type OrderOfferNature,
} from "@lfd/contracts";
import type { VatShare } from "@lfd/money";

import {
  InHouseOfferNotStaffGrantableError,
  InvalidOrderOfferError,
} from "../errors/order-offer-errors.js";

const ADMITTED: readonly string[] = ORDER_OFFER_NATURES.map((nature) => nature.key);

/**
 * **Pourquoi une commande est offerte** — doc
 * `documentation/commandes/passation/la-commande-offerte.md`, § 2.1. Une
 * nature du registre et un texte court, tous deux obligatoires : une
 * exception de l'équipe sans raison écrite ne se relit pas.
 */
export interface OrderOfferReason {
  readonly nature: OrderOfferNature;
  readonly note: string;
  /**
   * Le client reçoit-il les e-mails automatiques de la commande ? Non par
   * défaut : une dégustation, la commerciale l'apporte (décidé par Hugo le
   * 2026-11-23). Figé avec le motif, relu par chaque envoyeur automatique.
   */
  readonly notifyCustomer: boolean;
}

/**
 * **Ce que la commande offerte valait** : ce que le client aurait payé, au
 * calcul normal (promotions et frais compris). Le TTC, la TVA totale et par
 * taux, et le HT total qui en découle.
 *
 * Le HT par taux n'y est pas : le calcul des pros (`line_ht`) ne le produit
 * pas (`computeOrderTotals` ne rend que la TVA par taux, vérifié le
 * 2026-11-23). Le seuil des cadeaux de faible valeur se lit en TTC.
 */
export interface OrderOfferedValue {
  readonly totalCents: number;
  readonly htCents: number;
  readonly vatCents: number;
  readonly vatShares: readonly VatShare[];
}

/** Le motif et la valeur : ce que l'agrégat porte d'une commande offerte. */
export interface OrderOffer {
  readonly reason: OrderOfferReason;
  readonly value: OrderOfferedValue;
}

/**
 * Le motif, revalidé : le contrat le vérifie déjà, mais l'agrégat ne fait
 * confiance à aucun appelant.
 *
 * @throws {InvalidOrderOfferError} nature hors registre, texte vide ou trop long.
 */
export function orderOfferReasonOf(raw: {
  readonly nature: string;
  readonly note: string;
  readonly notifyCustomer?: boolean | undefined;
}): OrderOfferReason {
  if (!isAdmittedNature(raw.nature)) {
    throw new InvalidOrderOfferError(`nature inconnue « ${raw.nature} »`);
  }
  const note = raw.note.trim();
  if (note.length === 0) {
    throw new InvalidOrderOfferError("le texte est vide");
  }
  if (note.length > ORDER_OFFER_NOTE_MAX_LENGTH) {
    throw new InvalidOrderOfferError(`le texte dépasse ${ORDER_OFFER_NOTE_MAX_LENGTH} caractères`);
  }
  return { nature: raw.nature, note, notifyCustomer: raw.notifyCustomer ?? false };
}

function isAdmittedNature(nature: string): nature is OrderOfferNature {
  return ADMITTED.includes(nature);
}

/**
 * **Le motif qu'une saisie de l'équipe pose** : celui de {@link orderOfferReasonOf},
 * sauf la commande interne. Une commande interne n'a pas d'offrant — elle naît
 * de la passation quand le payeur est un de nos restaurants
 * ({@link IN_HOUSE_ORDER_REASON}) —, et l'équipe ne la choisit pas à la main.
 *
 * @throws {InHouseOfferNotStaffGrantableError} la nature `in_house`.
 * @throws {InvalidOrderOfferError} nature hors registre, texte vide ou trop long.
 */
export function staffOfferReasonOf(raw: {
  readonly nature: string;
  readonly note: string;
  readonly notifyCustomer?: boolean | undefined;
}): OrderOfferReason {
  if (raw.nature === IN_HOUSE_OFFER_NATURE) {
    throw new InHouseOfferNotStaffGrantableError();
  }
  return orderOfferReasonOf(raw);
}

/** Le texte que porte une commande interne : la nature dit déjà tout. */
export const IN_HOUSE_ORDER_NOTE = "Commande interne";

/**
 * **Le motif d'une commande interne**, posé par la composition quand le payeur
 * est un de nos restaurants. Le restaurant est prévenu comme pour toute
 * commande qu'il passe lui-même : c'est sa commande, pas un cadeau qu'on lui
 * apporte.
 */
export const IN_HOUSE_ORDER_REASON: OrderOfferReason = {
  nature: IN_HOUSE_OFFER_NATURE,
  note: IN_HOUSE_ORDER_NOTE,
  notifyCustomer: true,
};

/** Le motif est-il celui d'une commande interne ? */
export function isInHouseReason(reason: OrderOfferReason | null | undefined): boolean {
  return reason?.nature === IN_HOUSE_OFFER_NATURE;
}
