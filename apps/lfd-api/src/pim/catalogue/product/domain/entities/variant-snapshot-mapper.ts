import type { LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";
import { NO_MIN_QUANTITIES } from "../value-objects/min-quantities.js";
import { PIECE_SALE_TERMS } from "../value-objects/sale-terms.js";
import type { Sku } from "../value-objects/sku.value-object.js";
import type { VariantSnapshot } from "./variant-snapshot.js";

/** Ce qu'il faut pour ouvrir une déclinaison qui n'est pas le défaut. */
export interface OpenedVariantInput {
  readonly id: string;
  readonly sku: Sku;
  readonly name: LocalizedText;
  readonly options: Readonly<Record<string, string>>;
  readonly position: number;
  /** Celui du défaut au moment de l'ajout : c'est l'agrégat qui le passe. */
  readonly customRecipe: boolean;
}

/**
 * L'instantané de la déclinaison née avec son produit : par défaut, en tête,
 * sans tarif. Elle naît **hors taxe**, l'assiette historique du référentiel :
 * un article neuf n'a aucune raison de basculer sans qu'on le décide.
 */
export function openedDefaultSnapshot(input: {
  readonly id: string;
  readonly sku: Sku;
  readonly name: LocalizedText;
}): VariantSnapshot {
  return {
    id: input.id,
    sku: input.sku.value,
    name: input.name,
    internalLabel: input.name.fr,
    options: {},
    isDefault: true,
    isDiscontinued: false,
    position: 0,
    priceCents: null,
    weightGrams: null,
    proPriceMillicents: null,
    proPricePerKgMillicents: null,
    publicPricePerKgTtcCents: null,
    pricePerKgShownPublic: true,
    pricePerKgShownPro: true,
    ...PIECE_SALE_TERMS,
    hasBeenPublished: false,
    minQuantities: NO_MIN_QUANTITIES,
    minQuantityFollowsDefault: false,
    // Elle ne peut pas se suivre elle-même : c'est ELLE, le défaut.
    regulatoryFollowsDefault: false,
    pricingFollowsDefault: false,
    nutritionFollowsDefault: false,
    allergenSheet: null,
    nutrition: null,
  };
}

/**
 * L'instantané d'une déclinaison **de plus**. Elle naît **alignée** sur la
 * fiche réglementaire du défaut, et c'est le seul état de naissance
 * défendable : née nue, elle rendrait sa fiche impubliable (invariant 7), et —
 * sur un produit DÉJÀ en vente — partirait au canal avec `allergens: null`,
 * que le récepteur ne doit surtout pas lire « sans allergène ». Les VALEURS
 * naissent alignées pour la même raison.
 *
 * Sans tarif, et le tarif ne s'aligne pas d'office : une seconde déclinaison
 * existe précisément parce qu'elle se vend autrement, et un prix recopié du
 * défaut se facturerait sans que personne l'ait décidé. À la pièce, sans
 * minimum hérité (il refuserait des commandes que personne n'a décidé de
 * refuser) ; publiée seulement si son produit l'est déjà — l'agrégat le dit.
 */
export function openedSnapshot(input: OpenedVariantInput): VariantSnapshot {
  return {
    id: input.id,
    sku: input.sku.value,
    name: input.name,
    internalLabel: input.name.fr,
    options: input.options,
    isDefault: false,
    isDiscontinued: false,
    position: input.position,
    priceCents: null,
    weightGrams: null,
    proPriceMillicents: null,
    proPricePerKgMillicents: null,
    publicPricePerKgTtcCents: null,
    pricePerKgShownPublic: true,
    pricePerKgShownPro: true,
    ...PIECE_SALE_TERMS,
    hasBeenPublished: false,
    minQuantities: NO_MIN_QUANTITIES,
    minQuantityFollowsDefault: false,
    customRecipe: input.customRecipe,
    regulatoryFollowsDefault: true,
    nutritionFollowsDefault: true,
    pricingFollowsDefault: false,
    allergenSheet: null,
    nutrition: null,
  };
}

/**
 * L'instantané du défaut d'un produit **né d'une déclinaison détachée** : tout
 * ce qu'elle voyait, en propre.
 *
 * `resolved` est l'instantané RÉSOLU par son ancienne fiche — prix, allergènes,
 * valeurs et minimum du défaut qu'elle suivait y sont déjà substitués. Elle ne
 * suit plus rien : c'est elle, le défaut. Elle n'a jamais été publiée sous sa
 * nouvelle référence, donc son unité de vente n'est pas figée.
 */
export function defaultSnapshotFrom(
  resolved: VariantSnapshot,
  input: { readonly id: string; readonly sku: Sku; readonly name: LocalizedText },
): VariantSnapshot {
  return {
    ...resolved,
    id: input.id,
    sku: input.sku.value,
    name: input.name,
    internalLabel: input.name.fr,
    isDefault: true,
    isDiscontinued: false,
    detachedToProductId: null,
    detachedFromVariantId: resolved.id,
    position: 0,
    hasBeenPublished: false,
    minQuantityFollowsDefault: false,
    regulatoryFollowsDefault: false,
    pricingFollowsDefault: false,
    nutritionFollowsDefault: false,
  };
}
