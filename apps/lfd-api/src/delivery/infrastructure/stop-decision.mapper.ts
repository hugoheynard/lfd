import {
  STOP_DECISION_OUTCOMES,
  STOP_DECISION_SOURCES,
  type StopDecisionOutcome,
  type StopDecisionSource,
} from "@lfd/contracts";

/**
 * Les valeurs fermées de `delivery.stop_decision`, relues. La base les tient
 * par ses `CHECK` ; une valeur inconnue (une version future) se lit comme
 * absente plutôt que d'être inventée.
 */
export function outcomeOf(value: string | null): StopDecisionOutcome | null {
  return STOP_DECISION_OUTCOMES.find((known) => known === value) ?? null;
}

export function sourceOf(value: string | null): StopDecisionSource | null {
  return STOP_DECISION_SOURCES.find((known) => known === value) ?? null;
}
