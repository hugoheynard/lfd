import type { StaffSuggestionRuleSnapshot } from "../entities/staff-suggestion-rule.js";
import { triggeredCandidates, type SuggestionCandidate } from "./suggestion-candidates.js";

/**
 * **Combien d'articles décidés la fiche montre** — la même hypothèse que le
 * panier (`STAFF_CART_PLACES`, Q1 tranchée par Hugo le 2026-10-18 pour le
 * panier) : une place. Le calculé, qui remplira le reste, n'existe pas encore.
 */
export const STAFF_PRODUCT_PLACES = 1;

/**
 * Le déclencheur est-il vrai pour cette fiche ouverte ? « Partout » toujours ;
 * « fiche ouverte » si c'est la sienne. Un déclencheur de panier ne vaut
 * jamais en fiche — la règle d'emplacement de RS1, tenue ici aussi.
 */
export function triggeredByProduct(rule: StaffSuggestionRuleSnapshot, viewedSku: string): boolean {
  const { kind, ref } = rule.trigger;
  if (kind === "everywhere") {
    return true;
  }
  return kind === "product_viewed" && ref === viewedSku;
}

/**
 * **Les candidats de la fiche** : les suggérés des règles déclenchées, sans
 * jamais l'article de la fiche lui-même — on ne suggère pas ce qu'on regarde.
 */
export function productCandidates(
  ordered: readonly StaffSuggestionRuleSnapshot[],
  viewedSku: string,
): readonly SuggestionCandidate[] {
  return triggeredCandidates(ordered, (rule) => triggeredByProduct(rule, viewedSku), [viewedSku]);
}
