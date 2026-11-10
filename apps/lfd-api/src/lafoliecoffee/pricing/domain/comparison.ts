/**
 * **Ce qui a bougé entre deux instants.**
 *
 * Deux marqueurs sur l'axe du temps, et trois questions qui n'ont de sens que
 * posées ensemble : le prix a-t-il changé, de combien, et le volume a-t-il suivi.
 *
 * Ce module ne fait que l'arithmétique de l'écart. Les prix comparés viennent de
 * `resolvePrice` — la fonction qui facture — appelée à chacun des deux instants,
 * et les volumes de commandes réelles. Rien n'est estimé ici.
 */

/** Une variation relative, en points de base (`-1500` = −15 %). */
export type VariationBp = number | null;

const BASIS_POINTS = 10_000;

/**
 * L'écart de `before` à `after`, rapporté à `before`.
 *
 * `null` quand `before` vaut zéro : passer de rien à quelque chose n'est pas une
 * variation en pourcentage, c'est une apparition. Rendre `Infinity` aurait
 * traversé le fil en `null` de toute façon, mais sans dire pourquoi ; rendre
 * `10000` aurait fait passer une apparition pour un doublement.
 */
export function variationBp(before: number, after: number): VariationBp {
  if (before === 0) {
    return null;
  }
  return Math.round(((after - before) / before) * BASIS_POINTS);
}

/**
 * La fenêtre **miroir**, juste avant celle-ci et de même durée.
 *
 * Même durée, et ce n'est pas une élégance : comparer trente jours à quatre-vingt
 * -dix ferait passer une saison pour un effet. C'est la seule façon d'attribuer
 * un écart à ce qu'on a changé plutôt qu'à la longueur de la mesure — la même
 * règle que les fenêtres d'élasticité, qui la portent déjà.
 */
export function mirrorWindow(from: Date, to: Date): { from: Date; to: Date } {
  const span = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - span), to: from };
}

/** La durée d'une fenêtre en jours pleins — ce que l'écran annonce. */
export function windowDays(from: Date, to: Date): number {
  const DAY_MS = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS));
}
