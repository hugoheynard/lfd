import type { AlertKind, AlertRule } from "@lfd/contracts";

import type { StoredAlertRule } from "../alert-rules.js";

/**
 * Port des **réglages globaux d'alerte** — une ligne par type, écrite seulement
 * quand le staff y touche.
 *
 * `readAll` rend ce qui est **effectivement stocké et relisible**, pas la liste
 * des types : compléter avec les défauts est le travail de `resolveGlobalRules`,
 * qui est pur et testable sans base. Un port qui rendrait déjà la liste complète
 * mettrait cette règle dans l'adaptateur, hors de portée des tests de domaine.
 */
export abstract class AlertRulesStore {
  abstract readAll(): Promise<StoredAlertRule[]>;

  /** Écrit (ou remplace) le réglage d'un type. La clé est le type lui-même. */
  abstract save(kind: AlertKind, rule: AlertRule): Promise<void>;
}
