import {
  effectiveAlertRule,
  type AccountAlertOverride,
  type AccountAlertRuleView,
  type AlertKind,
  type AlertRule,
  type AlertRuleView,
} from "@lfd/contracts";

/**
 * Les règles **vues depuis un compte** : pour chaque type, ce que dit le global,
 * ce que le compte en fait, et ce qui s'applique réellement.
 *
 * Les trois voyagent ensemble et `effective` est calculé **ici** — une seule
 * implémentation, côté serveur. Le front se contente d'afficher : deux
 * résolutions de la même règle finiraient par diverger, et c'est l'écran qui
 * aurait tort sans que rien ne le signale.
 *
 * Fonction **pure** : c'est le seul endroit qui décide ce qu'un compte applique,
 * donc le seul à tester pour en être sûr.
 */
export function resolveAccountRules(
  globals: readonly AlertRuleView[],
  overrides: readonly AccountAlertOverride[],
): AccountAlertRuleView[] {
  const byKind = new Map(overrides.map((override) => [override.kind, override]));
  return globals.map((view) => {
    const global = toRule(view);
    const override = byKind.get(view.kind) ?? null;
    return { kind: view.kind, global, override, effective: effectiveAlertRule(global, override) };
  });
}

/** La vue globale porte aussi `kind` et `updatedAt` ; la dérogation ne compare que la règle. */
function toRule(view: AlertRuleView): AlertRule {
  return { enabled: view.enabled, params: view.params, delivery: view.delivery };
}

/** Les types réellement **actifs** sur ce compte — ce que l'évaluation lira. */
export function activeRulesFor(
  resolved: readonly AccountAlertRuleView[],
): Map<AlertKind, AlertRule> {
  return new Map(
    resolved.filter((row) => row.effective.enabled).map((row) => [row.kind, row.effective]),
  );
}
