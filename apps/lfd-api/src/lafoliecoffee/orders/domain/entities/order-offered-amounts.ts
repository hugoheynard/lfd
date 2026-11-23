import type { RevisableOrder } from "../../revision/domain/entities/order-revision.js";
import {
  OfferChangeOnRevisionError,
  OfferedOrderWithVoucherError,
} from "../errors/order-offer-errors.js";
import type { OrderOffer, OrderOfferReason } from "../value-objects/order-offer.js";
import type { DraftedAmounts } from "./order-amounts.js";
import type { DraftOrderInput } from "./order-shapes.js";

/**
 * **La ligne « offert »** — doc
 * `documentation/commandes/passation/la-commande-offerte.md`, § 2.2.
 *
 * La commande s'est composée entière, comme si le client la payait : lignes,
 * remises, promotions, frais de livraison. L'offre retranche ensuite ce qui
 * était dû, taux par taux. Elle ne passe pas par la chaîne des remises de
 * panier, qui ne touche que les lignes, laisserait les frais, compterait dans
 * le plafond de cinq remises et pourrait laisser un centime d'arrondi.
 * Retrancher des montants déjà arrondis donne zéro exactement.
 *
 * Ce qui reste : les lignes à leur prix et les termes de la composition
 * (sous-total, remise, frais), pour dire ce qui a été offert. Ce qui tombe à
 * zéro : la TVA, ses parts par taux, le total, et les parts TTC par taux
 * d'une commande `exact_ht` (vides : Σ des parts = total = 0).
 */
export function offeredAmountsOf(
  amounts: DraftedAmounts,
  reason: OrderOfferReason,
): { readonly amounts: DraftedAmounts; readonly offer: OrderOffer } {
  const offer: OrderOffer = {
    reason,
    value: {
      totalCents: amounts.totalCents,
      htCents: amounts.totalCents - amounts.vatCents,
      vatCents: amounts.vatCents,
      vatShares: amounts.vatShares,
    },
  };
  return {
    amounts: {
      ...amounts,
      vatCents: 0,
      vatShares: [],
      totalCents: 0,
      ttcByRate: amounts.ttcByRate === null ? null : [],
    },
    offer,
  };
}

/**
 * L'offre, si la composition en porte une. Un bon ne s'impute pas sur une
 * commande offerte : il serait consommé pour une commande ramenée à zéro.
 *
 * @throws {OfferedOrderWithVoucherError} un bon et une offre ensemble.
 */
export function offerAppliedTo(
  amounts: DraftedAmounts,
  input: Pick<DraftOrderInput, "offer" | "voucher">,
): { readonly amounts: DraftedAmounts; readonly offer: OrderOffer | null } {
  if (input.offer === undefined) {
    return { amounts, offer: null };
  }
  if (input.voucher !== null) {
    throw new OfferedOrderWithVoucherError();
  }
  return offeredAmountsOf(amounts, input.offer);
}

/**
 * **La révision relit l'offre sur la commande**, jamais sur la demande :
 * offerte elle l'était, offerte elle reste, avec sa valeur recalculée sur la
 * nouvelle composition. Une demande qui en porte une sur une commande qui ne
 * l'était pas est refusée ; l'inverse ne s'exprime pas (la demande n'a aucun
 * moyen de retirer l'offre).
 *
 * @throws {OfferChangeOnRevisionError} une offre posée par la révision.
 */
export function offerCarriedOn(
  current: Pick<RevisableOrder, "offer">,
  input: DraftOrderInput,
): DraftOrderInput {
  if (input.offer !== undefined && current.offer === undefined) {
    throw new OfferChangeOnRevisionError(false);
  }
  const { offer: _requested, ...rest } = input;
  return current.offer === undefined ? rest : { ...rest, offer: current.offer };
}
