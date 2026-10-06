import { DEFAULT_DOORSTEP_RULE, type DoorstepRule, type StopDecisionOutcome } from "@lfd/contracts";

/**
 * **La règle d'un arrêt** (`documentation/livraisons/a-la-porte.md`,
 * B3 bis, LB-Q6 : « global, overridable », « par adresse ») : l'adresse si
 * elle la redéfinit, sinon le réglage global, sinon « Me demander ». Deux
 * niveaux, pas de société. Résolue UNE fois, au départ, et figée.
 */
export function resolveDoorstepRule(
  globalRule: DoorstepRule | null,
  addressRule: DoorstepRule | null,
): DoorstepRule {
  return addressRule ?? globalRule ?? DEFAULT_DOORSTEP_RULE;
}

/** Ce que chaque règle répond d'avance ; « Me demander » ne répond rien. */
const SETTLED_OUTCOMES: Readonly<Record<DoorstepRule, StopDecisionOutcome | null>> = {
  ask: null,
  deposit: "authorize_deposit",
  bring_back: "bring_back",
};

/**
 * La réponse qu'une règle donne d'avance à un signalement, ou `null` :
 * « Me demander » laisse la décision au commercial (B3).
 */
export function settledOutcomeOf(rule: DoorstepRule): StopDecisionOutcome | null {
  return SETTLED_OUTCOMES[rule];
}
