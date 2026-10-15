import type { MediaCarriers } from "../media/channels/carriers/media-carriers.js";

/** Les porteurs de la médiathèque, nommés par ce qu'ils tiennent. */
export interface MediaCarrierParts {
  /** Le référentiel : fiches et familles. */
  readonly pimCatalogue: MediaCarriers;
  /** Le référentiel : ses opérations datées (`pim.operation`). */
  readonly pimOperations: MediaCarriers;
  readonly storefront: MediaCarriers;
  /** Les COPIES du commerce (`catalog_operations` tenue par le push). */
  readonly commerceCopies: MediaCarriers;
  /** Les opérations DU COMMERCE (`catalog_operations` tenue par l'agrégat). */
  readonly commerceOperations: MediaCarriers;
}

/**
 * **Qui répond pour les opérations**, selon `OPERATIONS_AT_COMMERCE` (lot 2
 * de `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`).
 *
 * - **Fermé** — exactement la liste d'avant, dans le même ordre : le
 *   référentiel (fiches, familles, puis opérations), la vitrine, les copies.
 * - **Ouvert** — l'opération vit au commerce : le référentiel ne compte ni ne
 *   repointe plus `pim.operation` (table qu'on ne sert plus), et les
 *   opérations du commerce remplacent les copies — compter les deux ferait
 *   dire « 2 emplois » pour une seule annonce.
 *
 * Une COMPOSITION, choisie une fois au démarrage, et pas une branche dans
 * chaque porteur : aucun d'eux ne sait qu'il existe un interrupteur.
 */
export function mediaCarriersFor(
  operationsAtCommerce: boolean,
  parts: MediaCarrierParts,
): readonly MediaCarriers[] {
  return operationsAtCommerce
    ? [parts.pimCatalogue, parts.storefront, parts.commerceOperations]
    : [parts.pimCatalogue, parts.pimOperations, parts.storefront, parts.commerceCopies];
}
