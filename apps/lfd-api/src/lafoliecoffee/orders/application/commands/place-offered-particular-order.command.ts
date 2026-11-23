import type { OfferedParticularOrderPayload } from "@lfd/contracts";

/**
 * L'équipe **offre une commande à un particulier**
 * (`la-commande-offerte.md`, § 2.5).
 *
 * Deux identités : `staffUserId`, celui qui offre (posé par la porte staff),
 * et `payload.buyerUserId`, la fiche du particulier — vérifiée par le
 * handler, jamais crue.
 */
export class PlaceOfferedParticularOrderCommand {
  constructor(
    readonly staffUserId: string,
    readonly payload: OfferedParticularOrderPayload,
    /** La clé d'intention de l'écran (en-tête `Idempotency-Key`). */
    readonly intentKey: string,
    /**
     * Celui qui saisit a le droit `b2b_offer_order:write`, lu en base par la
     * porte staff : sans lui, la route refuse.
     */
    readonly mayOffer: boolean,
  ) {}
}

/** La commande offerte : son total (zéro) et la valeur offerte TTC. */
export interface PlaceOfferedParticularOrderResult {
  readonly id: string;
  readonly orderNumber: string;
  readonly totalCents: number;
  readonly offeredTotalCents: number;
}
