import type { StaffSuggestionRuleSnapshot } from "../entities/staff-suggestion-rule.js";

/**
 * **Combien d'articles décidés le panier montre** — Q1 du plan, tranchée par
 * Hugo le 2026-10-18 : une place. Le calculé, qui remplira le reste, n'existe
 * pas encore (R1/R2).
 */
export const STAFF_CART_PLACES = 1;

/** Ce que le déclencheur regarde : les SKU au panier, et la lignée de leur famille. */
export interface CartContents {
  readonly skus: readonly string[];
  /** SKU → lignée de sa famille (elle-même d'abord). Absent = famille inconnue. */
  readonly familyPaths: ReadonlyMap<string, readonly string[]>;
}

/** Un article candidat, et la règle qui le propose. */
export interface CartCandidate {
  readonly sku: string;
  readonly rule: StaffSuggestionRuleSnapshot;
}

/**
 * Le déclencheur est-il vrai pour ce panier ? « Partout » toujours ; un
 * article s'il est au panier ; une famille si un article du panier s'y range,
 * elle ou l'une de ses sous-familles — comme une décision de prix. Une fiche
 * ouverte ne se voit pas d'ici : jamais vrai au panier.
 */
export function triggeredByCart(rule: StaffSuggestionRuleSnapshot, cart: CartContents): boolean {
  const { kind, ref } = rule.trigger;
  if (kind === "everywhere") {
    return true;
  }
  if (ref === null) {
    return false;
  }
  if (kind === "product_in_cart") {
    return cart.skus.includes(ref);
  }
  if (kind === "category_in_cart") {
    return cart.skus.some((sku) => cart.familyPaths.get(sku)?.includes(ref) === true);
  }
  return false;
}

/**
 * **Les candidats du panier**, dans l'ordre des règles déjà classées puis
 * celui des suggérés de chaque règle. Un article proposé par deux règles
 * revient à la première — c'est elle que l'ordre réglé met devant. Le filtre
 * de ce qui se commande (R4) passe ensuite : ici, rien n'est encore borné.
 */
export function cartCandidates(
  ordered: readonly StaffSuggestionRuleSnapshot[],
  cart: CartContents,
): readonly CartCandidate[] {
  const seen = new Set<string>();
  const candidates: CartCandidate[] = [];
  for (const rule of ordered) {
    if (!triggeredByCart(rule, cart)) {
      continue;
    }
    for (const sku of rule.suggestedSkus) {
      if (!seen.has(sku)) {
        seen.add(sku);
        candidates.push({ sku, rule });
      }
    }
  }
  return candidates;
}
