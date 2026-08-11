import {
  effectiveAlertRule,
  type AccountAlertOverride,
  type AccountAlertRuleView,
  type AlertKind,
  type AlertRule,
  type AlertRuleView,
} from "@lfd/contracts";

/**
 * Une dérogation telle qu'elle **sort de la base**.
 *
 * Comme pour les règles globales, l'illisible est explicite. Mais le repli n'est
 * pas le même : une dérogation qu'on ne sait plus relire est la trace d'un compte
 * qui a **explicitement refusé le global**. On ne sait plus ce qu'il voulait, on
 * sait qu'il ne voulait pas ça — donc on se tait (`off`) au lieu de le remettre
 * silencieusement sous surveillance.
 */
export type StoredOverride =
  | { readonly readable: true; readonly override: AccountAlertOverride; readonly updatedAt: Date }
  | { readonly readable: false; readonly kind: AlertKind; readonly updatedAt: Date };

/**
 * Les règles **vues depuis un compte** : pour chaque type, ce que dit le global,
 * ce que le compte en fait, et ce qui s'applique réellement.
 *
 * Les trois voyagent ensemble et `effective` est calculé **ici** — une seule
 * implémentation, côté serveur. Le front se contente d'afficher : deux
 * résolutions de la même règle finiraient par diverger, et c'est l'écran qui
 * aurait tort sans que rien ne le signale.
 *
 * Fonction **pure** : le seul endroit qui décide ce qu'un compte applique, donc
 * le seul à tester pour en être sûr.
 */
export function resolveAccountRules(
  globals: readonly AlertRuleView[],
  overrides: readonly StoredOverride[],
): AccountAlertRuleView[] {
  const byKind = new Map(overrides.map((row) => [kindOf(row), row]));
  return globals.map((view) => toAccountView(view, byKind.get(view.kind)));
}

function toAccountView(
  view: AlertRuleView,
  stored: StoredOverride | undefined,
): AccountAlertRuleView {
  const global = toRule(view);
  const override = resolveOverride(view.kind, stored);
  return {
    kind: view.kind,
    global,
    override,
    effective: effectiveAlertRule(global, override),
    globalUpdatedAt: view.updatedAt,
    overrideUpdatedAt: stored?.updatedAt.toISOString() ?? null,
    // Le prix du tout-ou-rien : un compte dérogé ne suit plus les évolutions de
    // la plateforme. Sans ce drapeau, personne ne s'en apercevrait avant des
    // mois — on ne remarque pas une alerte qui n'arrive pas.
    globalMovedSince: movedSince(view.updatedAt, stored?.updatedAt),
    degraded: view.degraded || stored?.readable === false,
  };
}

/** Une dérogation illisible se comporte en `off` — voir {@link StoredOverride}. */
function resolveOverride(
  kind: AlertKind,
  stored: StoredOverride | undefined,
): AccountAlertOverride | null {
  if (stored === undefined) {
    return null;
  }
  return stored.readable ? stored.override : { kind, mode: "off" };
}

function kindOf(stored: StoredOverride): AlertKind {
  return stored.readable ? stored.override.kind : stored.kind;
}

function movedSince(globalUpdatedAt: string | null, overrideUpdatedAt: Date | undefined): boolean {
  if (globalUpdatedAt === null || overrideUpdatedAt === undefined) {
    return false;
  }
  return new Date(globalUpdatedAt).getTime() > overrideUpdatedAt.getTime();
}

/** La vue globale porte aussi `kind` et ses métadonnées ; la règle est le reste. */
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
