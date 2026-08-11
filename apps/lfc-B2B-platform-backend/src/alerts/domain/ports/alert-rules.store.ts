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

  /**
   * Écrit le réglage d'un type, **attribué à son auteur** et **conditionné à la
   * version lue**.
   *
   * `expectedUpdatedAt` est la date que l'appelant avait sous les yeux (`null`
   * si le type n'avait jamais été réglé). Rend `false` quand la ligne a bougé
   * depuis : c'est la base qui arbitre, pas un « existe-t-il déjà ? » applicatif
   * que deux écritures concurrentes gagneraient toutes les deux.
   */
  abstract save(input: {
    readonly kind: AlertKind;
    readonly rule: AlertRule;
    readonly staffSub: string;
    readonly expectedUpdatedAt: Date | null;
  }): Promise<boolean>;
}
