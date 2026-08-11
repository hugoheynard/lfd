import {
  ALERT_KIND_ORDER,
  ALERT_KINDS,
  type AlertDelivery,
  type AlertKind,
  type AlertParams,
  type AlertRule,
  type AlertRuleView,
} from "@lfd/contracts";

/**
 * Une règle telle qu'elle **sort de la base**.
 *
 * Le cas `readable: false` est explicite, et c'est tout le point : une ligne que
 * le mapper ne sait plus relire (type retiré, forme changée) ne doit pas être
 * *silencieusement absente*. La première version la laissait tomber, si bien
 * qu'un réglage volontairement coupé pouvait revenir tout seul aux défauts —
 * canal client compris — sans que rien ne l'indique.
 */
export type StoredAlertRule =
  | {
      readonly kind: AlertKind;
      readonly readable: true;
      readonly enabled: boolean;
      readonly params: AlertParams;
      readonly delivery: AlertDelivery;
      readonly updatedAt: Date;
      readonly updatedBy: string | null;
    }
  | {
      readonly kind: AlertKind;
      readonly readable: false;
      readonly updatedAt: Date;
      readonly updatedBy: string | null;
    };

/**
 * Les règles globales, **tous les types connus servis**, dans l'ordre de
 * l'énuméré.
 *
 * Un type sans ligne en base n'est pas un type absent : c'est un type que
 * personne n'a encore réglé. Il sort donc avec les défauts déclarés dans
 * `ALERT_KINDS` et un `updatedAt` à `null` — le détecteur tourne dès le premier
 * démarrage sans qu'on ait eu à semer la table.
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
    return {
      kind,
      ...ALERT_KINDS[kind].defaults,
      updatedAt: null,
      updatedBy: null,
      degraded: false,
    };
  }
  if (!row.readable) {
    return {
      kind,
      ...silenced(ALERT_KINDS[kind].defaults),
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
      degraded: true,
    };
  }
  return {
    kind,
    enabled: row.enabled,
    params: row.params,
    delivery: row.delivery,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
    degraded: false,
  };
}

/**
 * Les défauts, **mais muets côté client**.
 *
 * Le sens du repli n'est pas le même des deux côtés du mur. Retomber sur les
 * défauts côté staff produit du bruit — désagréable, réparable. Retomber dessus
 * côté **client**, c'est faire réapparaître un message qu'on avait coupé, chez
 * quelqu'un d'extérieur à l'entreprise, sans que personne l'ait décidé. On ne
 * parle jamais au client par accident.
 */
function silenced(rule: AlertRule): AlertRule {
  return { ...rule, delivery: { ...rule.delivery, customerVisible: false } };
}
