/**
 * **La barre des bacs chargés, en traits** : un trait par bac, par paquets
 * de dix — on compte d'un coup d'œil, là où une barre pleine ne dit qu'une
 * proportion (Hugo, 2026-10-03).
 */

/** Un paquet de traits, séparé du suivant par un filet. */
export const RAIL_GROUP = 10;

/** Au-delà, sur un téléphone, un trait ferait moins de deux pixels : on garde la barre. */
export const RAIL_TICKS_MAX = 120;

/**
 * Les traits, groupés par dix, chargés d'abord (ils se remplissent de gauche
 * à droite) ; `null` sans bac, ou au-delà de {@link RAIL_TICKS_MAX}.
 */
export function railTicks(loaded: number, total: number): readonly (readonly boolean[])[] | null {
  if (total <= 0 || total > RAIL_TICKS_MAX) {
    return null;
  }
  const groups: boolean[][] = [];
  for (let start = 0; start < total; start += RAIL_GROUP) {
    const size = Math.min(RAIL_GROUP, total - start);
    groups.push(Array.from({ length: size }, (_, offset) => start + offset < loaded));
  }
  return groups;
}
