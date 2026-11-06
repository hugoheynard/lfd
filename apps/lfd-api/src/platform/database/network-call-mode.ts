/**
 * **Ce que fait la garde du réseau** quand un appel sortant part dans une
 * transaction (`NETWORK_IN_TRANSACTION`, chantier
 * `documentation/todos/todo-reseau-hors-transaction.md`) :
 *
 * - `off` — rien, pas même compter ;
 * - `report` — **le défaut** : un avertissement structuré avec la pile, et
 *   l'appel part quand même. C'est le temps de la mesure ;
 * - `enforce` — l'appel est refusé (`NetworkCallInsideTransactionError`). Pas
 *   en production avant que la dette mesurée soit soldée.
 */
export const NETWORK_CALL_MODES = ["off", "report", "enforce"] as const;

export type NetworkCallMode = (typeof NETWORK_CALL_MODES)[number];

export const DEFAULT_NETWORK_CALL_MODE: NetworkCallMode = "report";

export function isNetworkCallMode(value: string): value is NetworkCallMode {
  return (NETWORK_CALL_MODES as readonly string[]).includes(value);
}
