import type { StaffSuggestionRuleSnapshot } from "../entities/staff-suggestion-rule.js";
import type { SuggestionTriggering } from "./suggestion-candidates.js";

/**
 * **Combien d'articles décidés l'accueil montre** — la recommandation
 * d'origine du plan (Q1 : « 2 sur 3 »), retenue pour RS7. Le calculé, qui
 * remplira la troisième, n'existe pas encore.
 */
export const STAFF_HOME_PLACES = 2;

/**
 * Le déclencheur est-il vrai à l'accueil ? « Partout » seulement : l'accueil
 * n'a ni panier qu'on regarde, ni fiche ouverte — la règle d'emplacement de
 * RS1 refuse déjà d'y écrire un autre déclencheur, elle est tenue ici aussi.
 */
export function triggeredAtHome(rule: StaffSuggestionRuleSnapshot): boolean {
  return rule.trigger.kind === "everywhere";
}

/** Ce que l'accueil apporte à la chaîne commune : « partout », rien d'exclu. */
export function homeTriggering(): SuggestionTriggering {
  return { triggered: triggeredAtHome, excluded: [] };
}
