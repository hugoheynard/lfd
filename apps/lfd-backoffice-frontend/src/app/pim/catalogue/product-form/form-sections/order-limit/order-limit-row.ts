import type {
  EffectiveOrderTimeLimitView,
  EffectiveRuleView,
  OrderTimeLimitView,
} from '@lfd/pim-contracts';

import { daysPhrase } from '../../../../order-time-limits/limit-format';

/**
 * Retrouve la limite posée sur **ce produit**, ou `null`. Une limite de
 * famille n'est pas « la sienne » : elle se lit dans {@link familyRules}.
 */
export function productRule(
  rules: readonly OrderTimeLimitView[],
  productId: string,
): OrderTimeLimitView | null {
  return rules.find((rule) => rule.scope.type === 'product' && rule.scope.id === productId) ?? null;
}

/**
 * La limite s'applique-t-elle ? Il faut **le délai ET l'heure** : une ligne qui
 * n'en a qu'un ne refuse rien.
 */
export function limitApplies(rule: OrderTimeLimitView | null): rule is OrderTimeLimitView {
  return rule !== null && rule.daysBefore !== null && rule.time !== null;
}

/** Le nom d'une famille de la lignée, ou son identifiant faute de mieux. */
export function familyName(view: EffectiveOrderTimeLimitView, rule: OrderTimeLimitView): string {
  const id = rule.scope.id ?? '';
  return rule.scopeLabel ?? view.lineage.find((family) => family.id === id)?.label ?? id;
}

/**
 * Les limites de famille en jeu sur ce produit, la famille la plus proche
 * d'abord — chacune avec sa case « Exclure ».
 */
export function familyRules(view: EffectiveOrderTimeLimitView): readonly EffectiveRuleView[] {
  const rank = (entry: EffectiveRuleView): number =>
    view.lineage.findIndex((family) => family.id === entry.rule.scope.id);
  return view.rules
    .filter((entry) => entry.rule.scope.type === 'category')
    .slice()
    .sort((a, b) => rank(a) - rank(b));
}

/**
 * La limite effective et sa provenance, en une phrase : « 2 jours avant,
 * 12:00 — famille Gâteaux », « La veille, 18:00 — limite propre du produit ».
 * `null` quand aucune limite du référentiel ne vise le produit.
 */
export function effectivePhrase(view: EffectiveOrderTimeLimitView): string | null {
  const explained = view.explained;
  if (explained === null) {
    return null;
  }
  const { daysBefore, time } = explained.limit;
  const from = explained.from;
  const origin =
    from.type === 'product'
      ? 'limite propre du produit'
      : `famille ${view.lineage.find((family) => family.id === from.id)?.label ?? from.id}`;
  return `${daysPhrase(daysBefore)}, ${time} — ${origin}`;
}
