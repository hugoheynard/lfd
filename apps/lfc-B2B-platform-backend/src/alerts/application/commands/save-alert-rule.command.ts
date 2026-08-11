import type { AlertRule } from "@lfd/contracts";

/**
 * Commande **staff** : régler un type d'alerte pour toute la plateforme. Le type
 * n'est pas un argument séparé — il est le discriminant des paramètres, donc
 * déjà dans `rule`, et deux copies finiraient par diverger.
 */
export class SaveAlertRuleCommand {
  constructor(readonly rule: AlertRule) {}
}
