import type { StaffSuggestionRuleSnapshot } from "../entities/staff-suggestion-rule.js";

/** Un article candidat, et la règle qui le propose. */
export interface SuggestionCandidate {
  readonly sku: string;
  readonly rule: StaffSuggestionRuleSnapshot;
}

/**
 * **Les candidats d'un emplacement**, dans l'ordre des règles déjà classées
 * puis celui des suggérés de chaque règle. Un article proposé par deux règles
 * revient à la première — c'est elle que l'ordre réglé met devant. Le filtre
 * de ce qui se commande (R4) passe ensuite : ici, rien n'est encore borné.
 *
 * Chaque emplacement dit seulement ce qui déclenche (`triggered`) et ce qui ne
 * se propose jamais (`excluded`, p. ex. l'article de la fiche ouverte).
 */
export function triggeredCandidates(
  ordered: readonly StaffSuggestionRuleSnapshot[],
  triggered: (rule: StaffSuggestionRuleSnapshot) => boolean,
  excluded: readonly string[] = [],
): readonly SuggestionCandidate[] {
  const seen = new Set<string>(excluded);
  const candidates: SuggestionCandidate[] = [];
  for (const rule of ordered) {
    if (!triggered(rule)) {
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
