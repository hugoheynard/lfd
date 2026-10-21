import { resolveOrderCutoff, type OrderCutoffView } from "./order-cutoff.js";

/**
 * **La limite propre d'un article, telle que la boutique la montre** (Hugo,
 * 2026-10-21 — `documentation/limites-de-commande/limites-produit.md`
 * §4) : « Préparé sur commande — à commander 2 jours à l'avance, avant 12 h ».
 *
 * Sans la grâce, délibérément : la boutique annonce l'heure annoncée, pas le
 * rattrapage qu'un humain peut accorder après elle — la même règle que
 * `FulfillmentDayView.orderUntil`.
 */
export interface ShopItemOrderLimit {
  /** Combien de jours avant le jour de service. `0` = le jour même. */
  readonly daysBefore: number;
  /** L'heure de la limite ce jour-là, `HH:MM`, pendule de Paris. */
  readonly time: string;
}

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_HOUR = 60;

/**
 * Combien de minutes la limite tombe AVANT le minuit qui ouvre le jour de
 * service. Plus c'est grand, plus c'est tôt.
 *
 * Un compte de pendule, pas d'instant : il est exact tout jour sans changement
 * d'heure, et l'ordre de deux limites ne change pas un jour de changement
 * d'heure — les deux heures glissent ensemble.
 */
function minutesAhead(limit: ShopItemOrderLimit): number {
  const [hours = "0", minutes = "0"] = limit.time.split(":");
  return limit.daysBefore * MINUTES_PER_DAY - (Number(hours) * MINUTES_PER_HOUR + Number(minutes));
}

/**
 * **La limite d'un article est-elle plus stricte que la règle générale ?** —
 * son instant limite, pour un même jour de service, tombe-t-il AVANT celui de
 * la règle générale ?
 *
 * `general` à `null` : aucune règle générale en vigueur (aucune saisie, ou
 * l'heure limite générale désactivée) — toute limite d'article est alors plus
 * stricte que rien. À égalité, non : l'article ne dit rien de plus que la
 * boutique.
 */
export function isStricterOrderLimit(
  limit: ShopItemOrderLimit,
  general: ShopItemOrderLimit | null,
): boolean {
  return general === null || minutesAhead(limit) > minutesAhead(general);
}

/**
 * Ce que l'article sert à la boutique : sa limite résolue, **seulement** si
 * elle est plus stricte que la règle générale — sinon `null`, et la fiche ne
 * dit rien que la boutique ne dise déjà. La grâce n'est jamais rendue.
 */
export function shownItemOrderLimit(
  limit: ShopItemOrderLimit | null,
  rules: readonly OrderCutoffView[],
): ShopItemOrderLimit | null {
  if (limit === null) {
    return null;
  }
  const general = resolveOrderCutoff(rules);
  return isStricterOrderLimit(limit, general)
    ? { daysBefore: limit.daysBefore, time: limit.time }
    : null;
}
