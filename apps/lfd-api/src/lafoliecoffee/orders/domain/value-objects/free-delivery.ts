import type { CartAdjustment } from "@lfd/contracts";

import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Le franco figé sur une commande** (plan
 * `documentation/promotions/plan-livraison-offerte.md`, 1a ; décisions de
 * Hugo du 2026-11-05) : la livraison est offerte, et la commande retient le
 * seuil qui l'a offerte et ce qu'elle aurait coûté.
 *
 * La ligne « Livraison offerte » est AFFICHÉE, pas comptable : le frais
 * facturé vaut 0, la facture, sa TVA et Factur-X n'en savent rien. Le barème
 * offert reste celui de la commande (`deliveryFeeAdjustment`), pour que la
 * révision le rejuge contre le seuil figé (1b).
 *
 * 🔴 Le franco se juge sur le panier **commandé** : un départ incomplet ne le
 * fait pas perdre — c'est le défaut qui suit « figé à la passation ». Le bon
 * partiel et le soldé facturent donc un frais nul.
 */
export interface FreeDelivery {
  /** Le seuil HT appliqué, en centimes. */
  readonly thresholdCents: number;
  /** Ce que la livraison aurait coûté, HT, en centimes. */
  readonly waivedCents: number;
  /** La même chose TTC — commande `exact_ht` seulement, `null` sinon. */
  readonly waivedTtcCents: number | null;
}

/**
 * Le franco, s'il est bien formé : des centimes entiers, positifs ou nuls.
 *
 * @throws {InvalidFreeDeliveryError}
 */
export function freeDeliveryOf(value: FreeDelivery): FreeDelivery {
  const amounts = [value.thresholdCents, value.waivedCents, value.waivedTtcCents ?? 0];
  if (!amounts.every((cents) => Number.isSafeInteger(cents) && cents >= 0)) {
    throw new InvalidFreeDeliveryError();
  }
  return { ...value };
}

/**
 * **Le barème que la commande FACTURE** : aucun au franco, le barème figé
 * sinon. Tout lecteur qui recompose un frais (bon partiel, reprise des
 * remises, soldé) passe par ici — recomposer depuis le barème figé seul
 * facturerait le frais plein d'une livraison offerte.
 */
export function billedDeliveryFeeOf(
  frozenFee: CartAdjustment | null,
  freeDelivery: FreeDelivery | null,
): CartAdjustment | null {
  return freeDelivery === null ? frozenFee : null;
}

/** Un franco qui ne se compte pas en centimes entiers et positifs — 400. */
export class InvalidFreeDeliveryError extends DomainError {
  constructor() {
    super(
      "orders.free_delivery.invalid",
      "La livraison offerte de cette commande porte un seuil ou un montant qui n'est pas un nombre entier de centimes positif. Signalez-le à l'équipe technique avec le numéro de la commande.",
    );
  }
}
