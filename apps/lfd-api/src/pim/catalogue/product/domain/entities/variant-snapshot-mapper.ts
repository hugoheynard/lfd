import type { Audience } from "../../../shared/domain/value-objects/audience.js";
import type { LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";
import { NO_MIN_QUANTITIES } from "../value-objects/min-quantities.js";
import { PIECE_SALE_TERMS } from "../value-objects/sale-terms.js";
import type { Sku } from "../value-objects/sku.value-object.js";
import type { VariantLifecycle } from "./variant-lifecycle.js";
import type { VariantRegulatory } from "./variant-regulatory.js";
import type { VariantSale } from "./variant-sale.js";
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
    audience: null,
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
    // Elle suit sa fiche : une déclinaison ajoutée vend ce que vend la fiche.
    audience: null,
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
    // Le défaut suit toujours sa fiche (A2) : l'audience propre qu'elle
    // portait devient celle de la fiche neuve (`detachedFields`).
    audience: null,
    regulatoryFollowsDefault: false,
    pricingFollowsDefault: false,
    nutritionFollowsDefault: false,
  };
}

/** Ce qui reste à la déclinaison une fois ses trois objets sortis. */
export interface VariantCore {
  readonly id: string;
  readonly sku: string;
  readonly name: LocalizedText;
  readonly internalLabel: string | null;
  readonly options: Readonly<Record<string, string>>;
  readonly position: number;
  readonly customRecipe: boolean;
  readonly audience: Audience | null;
}

/**
 * L'instantané d'une déclinaison : son noyau et ce que portent ses trois
 * objets. L'ordre des clés est celui d'avant le découpage — l'empreinte de
 * révision lit cet instantané, et sa forme ne bouge pas.
 */
export function variantSnapshot(
  core: VariantCore,
  lifecycle: VariantLifecycle,
  regulatory: VariantRegulatory,
  sale: VariantSale,
): VariantSnapshot {
  const f = sale.fields;
  return {
    id: core.id,
    sku: core.sku,
    name: core.name,
    internalLabel: core.internalLabel,
    options: core.options,
    isDefault: lifecycle.isDefault,
    isDiscontinued: lifecycle.isDiscontinued,
    detachedToProductId: lifecycle.detachedToProductId,
    detachedFromVariantId: lifecycle.detachedFromVariantId,
    position: core.position,
    priceCents: f.priceCents,
    weightGrams: f.weightGrams,
    proPriceMillicents: f.proPriceMillicents,
    proPricePerKgMillicents: f.proPricePerKgMillicents,
    publicPricePerKgTtcCents: f.publicPricePerKgTtcCents,
    pricePerKgShownPublic: f.pricePerKgShownPublic,
    pricePerKgShownPro: f.pricePerKgShownPro,
    ...f.terms,
    hasBeenPublished: lifecycle.hasBeenPublished,
    minQuantities: f.minQuantities,
    minQuantityFollowsDefault: f.minQuantityFollowsDefault,
    customRecipe: core.customRecipe,
    // Absente quand la déclinaison suit sa fiche : l'instantané est haché par
    // la révision du catalogue, et une clé `null` ajoutée partout ferait
    // paraître chaque fiche modifiée.
    ...(core.audience === null ? {} : { audience: core.audience }),
    regulatoryFollowsDefault: regulatory.followsAllergens,
    pricingFollowsDefault: f.followsPricing,
    nutritionFollowsDefault: regulatory.followsNutrition,
    allergenSheet: regulatory.allergenSheet,
    nutrition: regulatory.nutrition,
  };
}
