import type { PromotionTerms } from "./promotion-terms.js";

/**
 * **Deux termes disent-ils la même chose ?** Comparaison structurelle de
 * chaque bloc — identité (description comprise : la changer est une
 * révision, journalisée), libellés, effet, fenêtre, public, acheminement,
 * portée, conditions, cumul. Sert à la révision : reposer à l'identique ne
 * trace rien et n'écrit rien.
 *
 * Les publics sont déjà canoniques (`PromotionAudienceSet` range ses cibles),
 * l'ordre des tableaux compte donc tel quel.
 */
export function sameTerms(left: PromotionTerms, right: PromotionTerms): boolean {
  return sameValue(left, right);
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (left instanceof Date || right instanceof Date) {
    return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return sameList(left, right);
  }
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) {
    return false;
  }
  return sameRecord(left, right);
}

function sameList(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  return left.every((item: unknown, index) => sameValue(item, right[index]));
}

function sameRecord(left: object, right: object): boolean {
  const leftEntries = Object.entries(left);
  const rightRecord = new Map(Object.entries(right));
  if (leftEntries.length !== rightRecord.size) {
    return false;
  }
  return leftEntries.every(
    ([key, value]) => rightRecord.has(key) && sameValue(value, rightRecord.get(key)),
  );
}
