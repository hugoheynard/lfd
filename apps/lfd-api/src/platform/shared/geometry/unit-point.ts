/**
 * **Un point du carré unité** : deux fractions de 0 à 1, depuis le coin haut
 * gauche d'un rectangle quelconque.
 *
 * Ici, dans `platform/`, parce que la règle n'a aucun métier et que deux blocs
 * l'appliquent sans pouvoir s'importer : la médiathèque y range le point focal
 * qu'elle décide, la vitrine du commerce la copie qu'elle en garde
 * (`documentation/mediatheque/mediatheque.md` §7 bis). Écrite deux fois, elle
 * avait déjà deux noms (`inUnit`, `isFraction` — vérifié le 2026-10-11).
 *
 * Chaque bloc garde son refus : ce module dit si un point est dans le cadre,
 * pas quoi répondre à qui l'a posé dehors.
 */
export interface UnitPoint {
  readonly x: number;
  readonly y: number;
}

/** Un nombre fini de 0 à 1, bornes comprises. */
export function isUnitFraction(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Les deux coordonnées sont-elles dans le carré unité ? */
export function isUnitPoint(point: UnitPoint): boolean {
  return isUnitFraction(point.x) && isUnitFraction(point.y);
}

/**
 * Deux points absents ou égaux. `null` reste distinct de `{ x: 0.5, y: 0.5 }` :
 * « personne ne s'est prononcé » n'est pas « au centre ».
 */
export function sameUnitPoint(left: UnitPoint | null, right: UnitPoint | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.x === right.x && left.y === right.y;
}
