import type { StaffSuggestionRuleSnapshot } from "../entities/staff-suggestion-rule.js";
import type { RuleGate } from "./applicable-suggestions.js";
import type { RuleCandidateTrace } from "./suggestion-candidates.js";

/** Pourquoi un candidat ne passe pas le filtre ou la vitrine. */
export type ItemRefusal = "item_not_served" | "item_in_cart" | "item_not_orderable_that_day";

/** Le sort d'une règle ou d'un article, dans le vocabulaire fermé de l'aperçu (RS5). */
export type SuggestionVerdict =
  | { readonly kind: "shown" }
  | { readonly kind: RuleGate | "trigger_false" | ItemRefusal | "item_is_the_product" }
  | { readonly kind: "outranked_by"; readonly ruleId: string };

export interface ItemDiagnosis {
  readonly sku: string;
  readonly verdict: SuggestionVerdict;
}

export interface RuleDiagnosis {
  readonly rule: StaffSuggestionRuleSnapshot;
  readonly verdict: SuggestionVerdict;
  /** Article par article, pour une règle déclenchée ; vide sinon. */
  readonly items: readonly ItemDiagnosis[];
}

/** Ce que la chaîne a vu, pas à pas — l'ordre de ses portes. */
export interface ShowcaseTrace {
  /** Les règles non archivées, dans l'ordre où le lecteur les a reçues. */
  readonly live: readonly StaffSuggestionRuleSnapshot[];
  readonly gateOf: (rule: StaffSuggestionRuleSnapshot) => RuleGate | null;
  /** Les applicables, classées, et leur déclenchement. */
  readonly traced: readonly RuleCandidateTrace[];
  /** Les candidats écartés par le filtre ou absents de la vitrine. */
  readonly refused: ReadonlyMap<string, ItemRefusal>;
  /** Ce qui est affiché, dans l'ordre : le SKU et l'id de sa règle. */
  readonly shown: readonly { readonly sku: string; readonly ruleId: string }[];
}

/**
 * **Pourquoi chaque règle s'affiche ou non** — la trace de la chaîne de la
 * boutique, lue règle par règle. Rien n'est rejugé ici : chaque raison est
 * celle qu'une porte a rendue. Un candidat qui a tout passé mais n'est pas
 * affiché a perdu la place : battu par la dernière règle affichée.
 *
 * Les applicables d'abord, dans l'ordre réglé ; puis les autres.
 */
export function diagnoseRules(trace: ShowcaseTrace): readonly RuleDiagnosis[] {
  const shownSkus = new Set(trace.shown.map(({ sku }) => sku));
  const lastShown = trace.shown.at(-1)?.ruleId ?? null;
  const itemVerdict = (sku: string): SuggestionVerdict => {
    if (shownSkus.has(sku)) {
      return { kind: "shown" };
    }
    const refused = trace.refused.get(sku);
    if (refused !== undefined) {
      return { kind: refused };
    }
    return lastShown === null ? { kind: "item_not_served" } : outranked(lastShown);
  };
  const applicable = trace.traced.map((traced) => tracedRule(traced, itemVerdict));
  const reached = new Set(trace.traced.map(({ rule }) => rule.id));
  const others = trace.live
    .filter((rule) => !reached.has(rule.id))
    .map((rule): RuleDiagnosis => ({ rule, verdict: gatedVerdict(trace.gateOf(rule)), items: [] }));
  return [...applicable, ...others];
}

function tracedRule(
  traced: RuleCandidateTrace,
  itemVerdict: (sku: string) => SuggestionVerdict,
): RuleDiagnosis {
  if (!traced.triggered) {
    return { rule: traced.rule, verdict: { kind: "trigger_false" }, items: [] };
  }
  const items = traced.items.map(({ sku, refusal }): ItemDiagnosis => {
    if (refusal === null) {
      return { sku, verdict: itemVerdict(sku) };
    }
    return {
      sku,
      verdict: refusal.kind === "outranked_by" ? outranked(refusal.ruleId) : { kind: refusal.kind },
    };
  });
  const shown = items.find(({ verdict }) => verdict.kind === "shown");
  return { rule: traced.rule, verdict: (shown ?? items[0])?.verdict ?? trigger(), items };
}

/**
 * Une règle hors des applicables a forcément une raison de porte ; `null` ne
 * survient que si l'appelant a sauté la chaîne (aucune applicable n'y entre
 * alors) — elle n'a pas été déclenchée.
 */
function gatedVerdict(gate: RuleGate | null): SuggestionVerdict {
  return gate === null ? trigger() : { kind: gate };
}

function trigger(): SuggestionVerdict {
  return { kind: "trigger_false" };
}

function outranked(ruleId: string): SuggestionVerdict {
  return { kind: "outranked_by", ruleId };
}
