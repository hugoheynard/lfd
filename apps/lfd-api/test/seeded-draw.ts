/**
 * **Un tirage déterministe** (mulberry32), partagé par les suites qui tirent
 * des paniers au hasard : `shop-quote-placement-property` et le golden master
 * du chiffrage (`pricing-golden-master`).
 *
 * Rien ne dépend de l'horloge ni de `Math.random` : une graine fixe rejoue les
 * mêmes paniers, et un rouge se reproduit à l'identique. Extrait le 2026-11-03
 * de `shop-quote-placement-property.e2e-spec.ts`, mot pour mot — changer la
 * suite de nombres changerait tous les paniers déjà tirés.
 */
export interface Drawer {
  /** Un nombre de [0, 1). */
  readonly next: () => number;
  /** Un entier de [min, max], bornes comprises. */
  readonly int: (min: number, max: number) => number;
}

/** Le tirage d'une graine. */
export function drawer(seed: number): Drawer {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return { next, int: (min, max) => min + Math.floor(next() * (max - min + 1)) };
}

/** Un élément tiré d'une liste jamais vide. */
export function pick<T>(rng: Drawer, items: readonly [T, ...T[]]): T {
  return items[rng.int(0, items.length - 1)] ?? items[0];
}
