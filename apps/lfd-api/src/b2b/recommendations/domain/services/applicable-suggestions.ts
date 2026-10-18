import type {
  StaffSuggestionOrder,
  StaffSuggestionPlacement,
  StaffSuggestionReader,
} from "@lfd/contracts";

import type { StaffSuggestionRuleSnapshot } from "../entities/staff-suggestion-rule.js";
import { periodCovers } from "../value-objects/suggestion-period.js";

/** Ce qu'on demande : un emplacement, un jour métier, et le lecteur s'il est connu. */
export interface ApplicableSuggestionsAsk {
  readonly placement: StaffSuggestionPlacement;
  /** Jour métier `AAAA-MM-JJ` (Paris), lu au `Clock` par l'appelant. */
  readonly today: string;
  /** `null` = lecteur inconnu : seules les règles `both` le concernent sûrement. */
  readonly reader: StaffSuggestionReader | null;
  readonly order: StaffSuggestionOrder;
}

/**
 * **Les règles qui s'appliquent** à un emplacement, aujourd'hui, pour ce
 * lecteur — dans l'ordre réglé (§3.1 et Q3 du plan).
 *
 * Ni le déclencheur (le panier ou la fiche ouverte, connus à l'affichage
 * seulement), ni le filtre de ce qui se commande (`RecommendationFilter`, R0)
 * ne s'appliquent ici : l'un et l'autre sont de RS2. Une règle suggérant un
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
    .filter(
      (rule) =>
        rule.archivedAt === null &&
        rule.active &&
        rule.placement === ask.placement &&
        periodCovers(rule.period, ask.today) &&
        reaches(rule, ask.reader),
    )
    .sort((left, right) =>
      ask.order === "priority"
        ? right.priority - left.priority || byRecent(left, right)
        : byRecent(left, right),
    );
}

function reaches(rule: StaffSuggestionRuleSnapshot, reader: StaffSuggestionReader | null): boolean {
  return rule.audience === "both" || rule.audience === reader;
}

function byRecent(left: StaffSuggestionRuleSnapshot, right: StaffSuggestionRuleSnapshot): number {
  const delta = right.created.at.getTime() - left.created.at.getTime();
  return delta !== 0 ? delta : right.id.localeCompare(left.id);
}
