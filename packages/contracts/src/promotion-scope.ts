/**
 * **La portée d'éligibilité d'une promotion** — « cet article est-il
 * concerné ? » (`documentation/promotions/promotions.md`, § 2.1, lot L2).
 *
 * Une seule mécanique, reprise de la remise d'un point de retrait : un MODE
 * (`all_except` : tout sauf ce que les règles retirent ; `only` : rien sauf ce
 * qu'elles incluent) et des règles par famille, par produit (toutes ses
 * déclinaisons) ou par déclinaison (le SKU). La règle la plus proche de
 * l'article l'emporte : déclinaison > produit > famille la plus proche > mode.
 *
 * Pure, et sans dépendance (ni zod) : UNE copie pour ses deux lecteurs — le
 * moteur (`apps/lfd-api/src/b2b/promotions/domain/promotion-scope.ts` la
 * réexporte) et le compteur « N articles concernés » du back-office, qui
 * l'importe par le sous-chemin `@lfd/contracts/promotion-scope` sans
 * embarquer le baril. Deux copies se seraient séparées à la première règle.
 *
 * Ni Nest, ni base. La remise de retrait d'aujourd'hui y délègue
 * (`pickup-discount-eligibility.ts`), et les règles de prix d'étage promotion
 * s'y traduisent sans changer un prix (tests d'égalité du lot L2).
 */

/**
 * L'unité de vente d'un article — les valeurs de `SaleUnit` (`@lfd/money`),
 * redites ici pour que le module reste sans dépendance.
 */
export type PromotionScopeSaleUnit = "piece" | "weight";

export type PromotionScopeMode = "all_except" | "only";

/**
 * `product` vise `catalog_items.product_id` (toutes ses déclinaisons, comme la
 * remise de retrait) ; `variant` vise le SKU vendu (comme une règle de prix,
 * dont `product` et `variant` comparent tous deux le SKU de l'article).
 */
export type PromotionScopeTarget = "category" | "product" | "variant";

export const PROMOTION_SCOPE_TARGETS: readonly PromotionScopeTarget[] = [
  "category",
  "product",
  "variant",
];

/**
 * Le rang naturel d'une cible, sur l'échelle de `SCOPE_RANK` de la
 * tarification (`global 0 < category 1 < product 2 < variant 3`) : c'est ce
 * qui garde l'ordre de `winnerOf` quand une règle de prix est reprise.
 */
export const NATURAL_TARGET_RANK: Readonly<Record<PromotionScopeTarget, number>> = {
  category: 1,
  product: 2,
  variant: 3,
};

/** Le rang d'une portée qui agit par son seul mode — la portée `global`. */
export const MODE_RANK = 0;

export interface PromotionScopeRule {
  readonly target: PromotionScopeTarget;
  /** Identifiant opaque du catalogue, sans clé étrangère. */
  readonly targetId: string;
  readonly eligible: boolean;
  /**
   * `null` = le rang naturel de la cible. Posé à `2` seulement pour une
   * déclinaison reprise d'une règle de portée `product` (§ 13.3) : même SKU
   * visé, mais le rang d'un produit.
   */
  readonly targetRank: number | null;
}

export interface PromotionScope {
  readonly mode: PromotionScopeMode;
  readonly rules: readonly PromotionScopeRule[];
}

/** Ce qu'il faut savoir d'un article pour juger s'il est concerné. */
export interface PromotionScopeFacts {
  /** Le SKU vendu — celui qu'une cible `variant` nomme. */
  readonly sku: string;
  /** `null` = produit inconnu du catalogue : seules familles et mode décident. */
  readonly productId: string | null;
  /** La famille de l'article puis ses parentes, la plus proche en tête. */
  readonly categoryPath: readonly string[];
}

/**
 * L'effet d'une promotion, réduit à sa nature — les valeurs de
 * `PromotionEffect["kind"]` du moteur, redites ici pour rester sans
 * dépendance.
 */
export type PromotionScopeEffectKind =
  "percent_off" | "unit_amount_off" | "fixed_unit_price" | "basket_amount_off";

/**
 * **Le point d'application** où la question est posée.
 *
 * Au point `line`, une décision qui couvre plusieurs articles — par le mode ou
 * par une famille — ne vise un article vendu au poids que si la promotion
 * S'Y ÉTEND (`extendsToWeight`, décision de Hugo du 2026-10-31,
 * `documentation/promotions/promotions.md`, § 2.2) : un pourcentage sans
 * quantité minimum se lit aussi bien sur un prix au kilo que sur un prix à la
 * pièce ; un montant, un prix posé ou un seuil en pièces non, et restent
 * réservés aux articles nommés. Le champ est OBLIGATOIRE pour que chaque
 * appelant le calcule par promotion ({@link promotionExtendsToWeight}) plutôt
 * que d'en hériter un défaut. Au point `basket`, la promotion est un montant
 * sur une assiette en hors taxe : l'unité de vente n'y joue pas, exactement
 * comme la remise de retrait d'aujourd'hui.
 */
export type PromotionScopePoint =
  | {
      readonly kind: "line";
      readonly saleUnit: PromotionScopeSaleUnit;
      readonly extendsToWeight: boolean;
    }
  | { readonly kind: "basket" };

/**
 * **Cette promotion s'étend-elle, au point ligne, aux articles au poids
 * qu'elle couvre par famille ou par mode ?** Oui pour un pourcentage sans
 * quantité minimum, et pour lui seul (décision de Hugo, 2026-10-31) : un
 * seuil en pièces n'a pas de lecture en grammes.
 */
export function promotionExtendsToWeight(
  effectKind: PromotionScopeEffectKind,
  hasMinQuantity: boolean,
): boolean {
  return effectKind === "percent_off" && !hasMinQuantity;
}

/** Ce qui a décidé de l'éligibilité, pour arbitrer entre deux promotions. */
export interface PromotionScopeMatch {
  /** Le rang de la décision : `MODE_RANK`, ou celui de la cible. */
  readonly rank: number;
  /** Pour une famille : plus elle est proche de l'article, plus c'est haut. */
  readonly familyCloseness: number;
}

/**
 * **L'article est-il concerné, et par quelle décision ?** `null` = non.
 *
 * 1. une règle sur sa DÉCLINAISON (son SKU) ;
 * 2. sinon une règle sur son PRODUIT ;
 * 3. sinon la règle de sa famille LA PLUS PROCHE ;
 * 4. sinon le mode : `all_except` le couvre, `only` non.
 *
 * Une règle `eligible: false` qui décide rend `null` : elle exclut, et rien
 * de plus lointain ne la contredit.
 */
export function promotionScopeMatch(
  scope: PromotionScope,
  facts: PromotionScopeFacts,
  point: PromotionScopePoint,
): PromotionScopeMatch | null {
  const article = articleRuleOf(scope, facts);
  if (article !== undefined) {
    return article.eligible ? { rank: rankOf(article), familyCloseness: 0 } : null;
  }
  if (point.kind === "line" && point.saleUnit !== "piece" && !point.extendsToWeight) {
    return null;
  }
  const family = nearestFamilyRule(scope, facts.categoryPath);
  if (family !== null) {
    return family.rule.eligible
      ? { rank: rankOf(family.rule), familyCloseness: family.closeness }
      : null;
  }
  return scope.mode === "all_except" ? { rank: MODE_RANK, familyCloseness: 0 } : null;
}

/** **L'article est-il concerné ?** — la question de l'assiette. */
export function promotionScopeCovers(
  scope: PromotionScope,
  facts: PromotionScopeFacts,
  point: PromotionScopePoint,
): boolean {
  return promotionScopeMatch(scope, facts, point) !== null;
}

/** Le rang d'une règle : celui qu'elle porte, ou celui de sa cible. */
export function rankOf(rule: PromotionScopeRule): number {
  return rule.targetRank ?? NATURAL_TARGET_RANK[rule.target];
}

function articleRuleOf(
  scope: PromotionScope,
  facts: PromotionScopeFacts,
): PromotionScopeRule | undefined {
  const variant = scope.rules.find(
    (rule) => rule.target === "variant" && rule.targetId === facts.sku,
  );
  if (variant !== undefined || facts.productId === null) {
    return variant;
  }
  return scope.rules.find((rule) => rule.target === "product" && rule.targetId === facts.productId);
}

function nearestFamilyRule(
  scope: PromotionScope,
  categoryPath: readonly string[],
): { readonly rule: PromotionScopeRule; readonly closeness: number } | null {
  for (const [index, categoryId] of categoryPath.entries()) {
    const rule = scope.rules.find(
      (candidate) => candidate.target === "category" && candidate.targetId === categoryId,
    );
    if (rule !== undefined) {
      return { rule, closeness: categoryPath.length - index };
    }
  }
  return null;
}
