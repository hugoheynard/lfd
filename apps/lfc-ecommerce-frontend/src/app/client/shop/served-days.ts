import type { FulfillmentDayView } from '@lfd/contracts';

/**
 * **La fenêtre des jours servis**, telle que `GET /fulfillment-days` permet de
 * la dire — ni plus, ni moins.
 *
 * ⚠️ Le serveur ne rend que la PREMIÈRE journée demandable par point (et
 * `null` pour la livraison), pas la liste des jours ouverts (vérifié le
 * 2026-10-27, `pickup-points.store.ts` et `delivery-address-dialog.ts`). Un
 * jour est donc « servi » quand il tombe entre la plus tôt de ces journées et
 * le dernier jour proposable ({@link ServicePoints.lastDay}) — la même règle
 * que les onglets du sélecteur d'heure, qui partent de la première journée et
 * laissent chaque jour dire s'il a des créneaux. Un jour de fermeture au-delà
 * de la première journée n'est pas connu ici : il le dira à l'étape suivante.
 */
export interface ServedWindow {
  readonly first: string | null;
  readonly last: string | null;
}

/** La plus tôt des journées servies, toutes portes confondues, et la borne haute. */
export function servedWindow(
  days: readonly FulfillmentDayView[],
  lastDay: string | null,
): ServedWindow {
  const dates = days.map((day) => day.date).filter((date): date is string => date !== null);
  const first = dates.length === 0 ? null : dates.reduce((a, b) => (b < a ? b : a));
  return { first, last: lastDay };
}

/** Ce jour se commande-t-il ? */
export function isServedDay(day: string, window: ServedWindow): boolean {
  return (
    window.first !== null && day >= window.first && (window.last === null || day <= window.last)
  );
}

/**
 * **Aujourd'hui est-il servi, et jusqu'à quand ?** — `null` quand aucune porte
 * ne sert aujourd'hui (le serveur ne le rend pas), sinon l'heure limite la plus
 * TÔT parmi celles qui le servent (`null` si aucune n'est annoncée) : la plus
 * tôt est la seule que l'on peut promettre pour toutes.
 */
export function todayService(
  days: readonly FulfillmentDayView[],
  today: string,
): { readonly orderUntil: string | null } | null {
  const served = days.filter((day) => day.date === today);
  if (served.length === 0) {
    return null;
  }
  const limits = served
    .map((day) => day.orderUntil)
    .filter((limit): limit is string => limit !== null);
  return {
    orderUntil:
      limits.length === 0 ? null : limits.reduce((a, b) => (new Date(b) < new Date(a) ? b : a)),
  };
}
