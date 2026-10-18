import type {
  StaffSuggestionOrder,
  StaffSuggestionPlacement,
  StaffSuggestionReader,
} from "@lfd/contracts";

import type { StaffSuggestionRuleSnapshot } from "../entities/staff-suggestion-rule.js";
import { periodCovers } from "../value-objects/suggestion-period.js";
import {
  conditionGate,
  type ConditionContext,
  type ConditionGate,
} from "./suggestion-conditions-gate.js";

/** Ce qu'on demande : un emplacement, un jour métier, et le lecteur s'il est connu. */
export interface ApplicableSuggestionsAsk {
  readonly placement: StaffSuggestionPlacement;
  /** Jour métier `AAAA-MM-JJ` (Paris), lu au `Clock` par l'appelant. */
  readonly today: string;
  /** `null` = lecteur inconnu : seules les règles `both` le concernent sûrement. */
  readonly reader: StaffSuggestionReader | null;
  readonly order: StaffSuggestionOrder;
  /**
   * Ce que l'affichage sait pour juger les conditions (RS8) ; `null` = elles
   * ne sont pas jugées (la liste des applicables de l'écran, qui n'a ni heure
   * ni panier).
   */
  readonly context: ConditionContext | null;
}

/**
 * **Les règles qui s'appliquent** à un emplacement, aujourd'hui, pour ce
 * lecteur — dans l'ordre réglé (`suggestions-du-staff.md` §3).
 *
 * Ni le déclencheur (le panier, la fiche ouverte ou l'accueil, connus à
 * l'affichage seulement), ni le filtre de ce qui se commande
 * (`RecommendationFilter`) ne s'appliquent ici : la vitrine commune
 * (`StaffSuggestionShowcase`) les déroule ensuite. Une règle suggérant un
 * article indisponible sort donc d'ici et disparaît à l'affichage.
 *
 * L'ordre : `recent`, la plus récemment CRÉÉE d'abord — la réécrire ne la
 * fait pas passer devant une règle plus jeune ; `priority`, la priorité la
 * plus haute, puis la plus récente à égalité. L'id départage deux créations
 * au même instant, pour un ordre stable.
 */
export function applicableSuggestions(
  rules: readonly StaffSuggestionRuleSnapshot[],
  ask: ApplicableSuggestionsAsk,
): readonly StaffSuggestionRuleSnapshot[] {
  return rules
    .filter((rule) => rule.archivedAt === null && ruleGate(rule, ask) === null)
    .sort((left, right) =>
      ask.order === "priority"
        ? right.priority - left.priority || byRecent(left, right)
        : byRecent(left, right),
    );
}

/** Ce qui écarte une règle avant tout déclencheur — l'aperçu (RS5) le nomme. */
export type RuleGate =
  "ended" | "not_started" | "inactive" | "wrong_audience" | "wrong_placement" | ConditionGate;

/**
 * **Pourquoi une règle non archivée ne s'applique pas**, ou `null` si elle
 * s'applique. Une seule raison, la première dans cet ordre : la période, puis
 * l'interrupteur, puis l'audience, puis l'emplacement, puis les conditions
 * (`conditionGate` : jour de la semaine, heure, point de retrait, montant). `applicableSuggestions`
 * ne garde que les `null` : l'aperçu et la boutique lisent la même règle.
 */
export function ruleGate(
  rule: StaffSuggestionRuleSnapshot,
  ask: Pick<ApplicableSuggestionsAsk, "placement" | "today" | "reader" | "context">,
): RuleGate | null {
  if (!periodCovers(rule.period, ask.today)) {
    return ask.today > rule.period.endsOn ? "ended" : "not_started";
  }
  if (!rule.active) {
    return "inactive";
  }
  if (!reaches(rule, ask.reader)) {
    return "wrong_audience";
  }
  if (rule.placement !== ask.placement) {
    return "wrong_placement";
  }
  return ask.context === null ? null : conditionGate(rule.conditions, ask.context);
}

function reaches(rule: StaffSuggestionRuleSnapshot, reader: StaffSuggestionReader | null): boolean {
  return rule.audience === "both" || rule.audience === reader;
}

function byRecent(left: StaffSuggestionRuleSnapshot, right: StaffSuggestionRuleSnapshot): number {
  const delta = right.created.at.getTime() - left.created.at.getTime();
  return delta !== 0 ? delta : right.id.localeCompare(left.id);
}
