/**
 * L'ordre des identifiants, indépendant de la locale : c'est lui qui départage
 * toute égalité du calcul de tournée (L7-C12), pour qu'une même entrée rende
 * toujours la même proposition.
 */
export function compareIds(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
