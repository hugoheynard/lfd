import {
  ALERT_KIND_ORDER,
  ALERT_KINDS,
  type AlertDelivery,
  type AlertKind,
  type AlertParams,
  type AlertRuleView,
} from "@lfd/contracts";

/**
 * Une règle telle qu'elle **sort de la base**, déjà relue contre le contrat par
 * l'adaptateur. Le domaine ne voit jamais de JSON brut : une ligne illisible
 * (type retiré du code, forme changée) est écartée par le mapper, et le type
 * concerné retombe ici sur ses défauts.
 */
export interface StoredAlertRule {
  readonly kind: AlertKind;
  readonly enabled: boolean;
  readonly params: AlertParams;
  readonly delivery: AlertDelivery;
  readonly updatedAt: Date;
}

/**
 * Les règles globales, **tous les types connus servis**, dans l'ordre de
 * l'énuméré.
 *
 * Un type sans ligne en base n'est pas un type absent : c'est un type que
 * personne n'a encore réglé. Il sort donc avec les défauts déclarés dans
 * `ALERT_KINDS` et un `updatedAt` à `null` — l'écran dit « jamais réglé » plutôt
 * que d'inventer une date, et le détecteur tourne dès le premier démarrage sans
 * qu'on ait eu à semer la table.
 *
 * Fonction **pure** : c'est elle qui garantit qu'ajouter un type au contrat le
 * rend immédiatement visible et actif, sans migration ni écriture.
 */
export function resolveGlobalRules(stored: readonly StoredAlertRule[]): AlertRuleView[] {
  const byKind = new Map(stored.map((row) => [row.kind, row]));
  return ALERT_KIND_ORDER.map((kind) => toView(kind, byKind.get(kind)));
}

function toView(kind: AlertKind, row: StoredAlertRule | undefined): AlertRuleView {
  if (row === undefined) {
    return { kind, ...ALERT_KINDS[kind].defaults, updatedAt: null };
  }
  return {
    kind,
    enabled: row.enabled,
    params: row.params,
    delivery: row.delivery,
    updatedAt: row.updatedAt.toISOString(),
  };
}
