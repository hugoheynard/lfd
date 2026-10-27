import type { ProductStatus } from "../entities/product.js";
import type { VariantSnapshot } from "../entities/variant.js";

/** Ce qui change sur l'ingrédient — déjà confronté à ce qu'il porte maintenant. */
export interface PropagationChange {
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

/** Pourquoi un code ne peut pas être propagé à une déclinaison. */
export type PropagationBlockReason = "archived_allergen" | "refused_by_declaration";

export interface BlockedCode {
  readonly code: string;
  readonly reason: PropagationBlockReason;
}

/** Ce que la propagation ferait à UNE déclinaison à déclaration propre. */
export interface VariantPropagation {
  readonly variantId: string;
  readonly sku: string;
  /** Les codes ajoutés aux allergènes, promus d'une trace compris. */
  readonly toAdd: readonly string[];
  readonly toRemove: readonly string[];
  /** Parmi `toAdd`, ceux qu'elle déclarait en trace : ils quittent « peut contenir ». */
  readonly promotedFromTrace: readonly string[];
  /** Le retrait vide la liste : elle affirmera « aucun allergène ». */
  readonly becomesNone: boolean;
  /** Ce qu'elle ne recevra pas, et pourquoi — le reste s'applique (décision 4). */
  readonly blocked: readonly BlockedCode[];
  readonly undeclared: boolean;
  /** Retraits demandés que la déclaration garde : un autre ingrédient les porte. */
  readonly keptByOtherIngredient: readonly string[];
}

export interface ProductPropagation {
  readonly productId: string;
  readonly name: string;
  readonly status: Exclude<ProductStatus, "archived">;
  readonly variants: readonly VariantPropagation[];
}

/**
 * Les comptes du message — une PARTITION des fiches touchées (décision 7 du
 * 2026-10-27) : chaque fiche dans une seule rubrique, par priorité
 * à perdre > à recevoir > bloquée > non renseignée > déjà conforme > gardée par un autre
 * ingrédient. « Publiées » est un sous-ensemble de « à recevoir » / « à perdre ».
 */
export interface PropagationCounts {
  readonly productsTouched: number;
  readonly toLose: number;
  readonly toLosePublished: number;
  readonly toReceive: number;
  readonly toReceivePublished: number;
  /** Son seul changement est refusé (code archivé) : elle n'est pas conforme. */
  readonly blocked: number;
  readonly undeclared: number;
  readonly alreadyDeclared: number;
  readonly keptByOtherIngredient: number;
}

/**
 * Ne garde de la demande que ce que l'ingrédient dit ENCORE : un ajout qu'il ne
 * porte plus, ou un retrait qu'il porte de nouveau, n'est plus à propager. C'est
 * ce qui empêche un aperçu ancien — ou une demande forgée — de décider seul.
 */
export function effectiveChange(
  requested: PropagationChange,
  ingredientAllergens: readonly string[],
): PropagationChange {
  const carried = new Set(ingredientAllergens);
  return {
    added: unique(requested.added).filter((code) => carried.has(code)),
    removed: unique(requested.removed).filter((code) => !carried.has(code)),
  };
}

/**
 * Ce que la propagation ferait à une déclinaison **résolue**.
 *
 * - non renseignée (`null`) → rien, signalée : on ne fabrique pas une
 *   déclaration que personne n'a faite (D5) ;
 * - ajout → ce que la déclaration ne porte pas, « aucun allergène » compris ;
 *   un code déclaré en trace est PROMU (si l'ingrédient le contient, ce n'est
 *   plus une trace) ; un code archivé qu'elle ne portait pas est bloqué ;
 * - retrait → seulement ce qu'elle déclare ET qu'aucun autre ingrédient de la
 *   composition ne porte encore.
 *
 * @param archived les codes archivés du référentiel — un ajout neuf les refuse.
 */
export function variantPropagation(
  variant: VariantSnapshot,
  change: PropagationChange,
  otherCited: readonly string[],
  archived: ReadonlySet<string> = new Set(),
): VariantPropagation {
  const sheet = variant.allergenSheet;
  if (sheet === null) {
    return { ...EMPTY, variantId: variant.id, sku: variant.sku, undeclared: true };
  }
  const missing = change.added.filter((code) => !sheet.declared.includes(code));
  const isBlocked = (code: string) => archived.has(code) && !sheet.mayContain.includes(code);
  const toAdd = missing.filter((code) => !isBlocked(code));
  const removable = change.removed.filter((code) => sheet.declared.includes(code));
  const toRemove = removable.filter((code) => !otherCited.includes(code));
  return {
    variantId: variant.id,
    sku: variant.sku,
    toAdd,
    toRemove,
    promotedFromTrace: toAdd.filter((code) => sheet.mayContain.includes(code)),
    becomesNone:
      toRemove.length > 0 && [...sheet.declared, ...toAdd].every((code) => toRemove.includes(code)),
    blocked: missing
      .filter(isBlocked)
      .map((code) => ({ code, reason: "archived_allergen" as const })),
    undeclared: false,
    keptByOtherIngredient: removable.filter((code) => otherCited.includes(code)),
  };
}

const EMPTY = {
  toAdd: [],
  toRemove: [],
  promotedFromTrace: [],
  becomesNone: false,
  blocked: [],
  keptByOtherIngredient: [],
} as const;

/**
 * Les déclinaisons qui portent **leur propre** déclaration : une alignée suit
 * celle du défaut, et la propager deux fois écrirait sous elle une fiche
 * dormante que personne ne lit.
 */
export function ownDeclarations(resolved: readonly VariantSnapshot[]): VariantSnapshot[] {
  return [...resolved]
    .filter((variant) => !variant.regulatoryFollowsDefault)
    .sort((left, right) => left.position - right.position);
}

/**
 * La déclaration d'après : les ajouts (sortis des traces s'ils y étaient),
 * moins les retraits non décochés. Les autres traces ne bougent pas.
 */
export function propagatedSheet(
  sheet: { readonly declared: readonly string[]; readonly mayContain: readonly string[] },
  variant: VariantPropagation,
  removalKept: boolean,
): { allergens: string[]; mayContain: string[] } {
  const removed = removalKept ? [] : variant.toRemove;
  return {
    allergens: [...sheet.declared, ...variant.toAdd].filter((code) => !removed.includes(code)),
    mayContain: sheet.mayContain.filter((code) => !variant.promotedFromTrace.includes(code)),
  };
}

type Bucket =
  "toLose" | "toReceive" | "blocked" | "undeclared" | "alreadyDeclared" | "keptByOtherIngredient";

/** La rubrique d'UNE fiche — la première vraie dans l'ordre de priorité. */
function bucketOf(product: ProductPropagation, change: PropagationChange): Bucket {
  if (some(product, (v) => v.toRemove.length > 0)) {
    return "toLose";
  }
  if (some(product, (v) => v.toAdd.length > 0)) {
    return "toReceive";
  }
  if (some(product, (v) => v.blocked.length > 0)) {
    return "blocked";
  }
  if (some(product, (v) => v.undeclared)) {
    return "undeclared";
  }
  if (change.added.length > 0) {
    return "alreadyDeclared";
  }
  // Un retrait seul : gardée par un autre ingrédient, ou rien à retirer — ce
  // qui revient à « déjà conforme ».
  return some(product, (v) => v.keptByOtherIngredient.length > 0)
    ? "keptByOtherIngredient"
    : "alreadyDeclared";
}

/** Les comptes du message — une partition, cf. {@link PropagationCounts}. */
export function propagationCounts(
  products: readonly ProductPropagation[],
  change: PropagationChange,
): PropagationCounts {
  const of = (bucket: Bucket) => products.filter((p) => bucketOf(p, change) === bucket);
  const losing = of("toLose");
  const receiving = of("toReceive");
  return {
    productsTouched: products.length,
    toLose: losing.length,
    toLosePublished: published(losing),
    toReceive: receiving.length,
    toReceivePublished: published(receiving),
    blocked: of("blocked").length,
    undeclared: of("undeclared").length,
    alreadyDeclared: of("alreadyDeclared").length,
    keptByOtherIngredient: of("keptByOtherIngredient").length,
  };
}

function some(
  product: ProductPropagation,
  test: (variant: VariantPropagation) => boolean,
): boolean {
  return product.variants.some(test);
}

function published(products: readonly ProductPropagation[]): number {
  return products.filter((product) => product.status === "published").length;
}

function unique(codes: readonly string[]): string[] {
  return [...new Set(codes)];
}
