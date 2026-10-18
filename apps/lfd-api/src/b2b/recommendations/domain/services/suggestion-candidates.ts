import type { StaffSuggestionRuleSnapshot } from "../entities/staff-suggestion-rule.js";

/** Un article candidat, et la règle qui le propose. */
export interface SuggestionCandidate {
  readonly sku: string;
  readonly rule: StaffSuggestionRuleSnapshot;
}

/**
 * Ce qu'un emplacement apporte à la chaîne : ce qui déclenche, et ce qui ne
 * se propose jamais (`excluded`, p. ex. l'article de la fiche ouverte).
 */
export interface SuggestionTriggering {
  readonly triggered: (rule: StaffSuggestionRuleSnapshot) => boolean;
  readonly excluded: readonly string[];
}

/** Pourquoi un suggéré d'une règle déclenchée ne devient pas candidat. */
export type CandidateRefusal =
  | { readonly kind: "item_is_the_product" }
  | { readonly kind: "outranked_by"; readonly ruleId: string };

/** Le sort d'un suggéré : candidat (`refusal === null`) ou écarté. */
export interface CandidateTrace {
  readonly sku: string;
  readonly refusal: CandidateRefusal | null;
}

/** Une règle applicable : déclenchée ou non, et le sort de ses suggérés si elle l'est. */
export interface RuleCandidateTrace {
  readonly rule: StaffSuggestionRuleSnapshot;
  readonly triggered: boolean;
  readonly items: readonly CandidateTrace[];
}

/**
 * **La trace des candidats** : pour chaque règle déjà classée, si elle est
 * déclenchée et ce que devient chacun de ses suggérés. Un article proposé par
 * deux règles revient à la première — c'est elle que l'ordre réglé met
 * devant, la seconde est battue par elle. L'aperçu (RS5) la lit entière ; la
 * boutique n'en garde que les candidats (`triggeredCandidates`).
 */
export function traceCandidates(
  ordered: readonly StaffSuggestionRuleSnapshot[],
  triggering: SuggestionTriggering,
): {
  readonly candidates: readonly SuggestionCandidate[];
  readonly rules: readonly RuleCandidateTrace[];
} {
  const excluded = new Set(triggering.excluded);
  const owner = new Map<string, string>();
  const candidates: SuggestionCandidate[] = [];
  const rules = ordered.map((rule): RuleCandidateTrace => {
    if (!triggering.triggered(rule)) {
      return { rule, triggered: false, items: [] };
    }
    const items = rule.suggestedSkus.map((sku): CandidateTrace => {
      if (excluded.has(sku)) {
        return { sku, refusal: { kind: "item_is_the_product" } };
      }
      const taken = owner.get(sku);
      if (taken !== undefined) {
        return { sku, refusal: { kind: "outranked_by", ruleId: taken } };
      }
      owner.set(sku, rule.id);
      candidates.push({ sku, rule });
      return { sku, refusal: null };
    });
    return { rule, triggered: true, items };
  });
  return { candidates, rules };
}

/**
 * **Les candidats d'un emplacement**, dans l'ordre des règles déjà classées
 * puis celui des suggérés de chaque règle. Le filtre de ce qui se commande
 * (R4) passe ensuite : ici, rien n'est encore borné.
 *
 * Chaque emplacement dit seulement ce qui déclenche (`triggered`) et ce qui ne
 * se propose jamais (`excluded`, p. ex. l'article de la fiche ouverte).
 */
export function triggeredCandidates(
  ordered: readonly StaffSuggestionRuleSnapshot[],
  triggered: (rule: StaffSuggestionRuleSnapshot) => boolean,
  excluded: readonly string[] = [],
): readonly SuggestionCandidate[] {
  return traceCandidates(ordered, { triggered, excluded }).candidates;
}
