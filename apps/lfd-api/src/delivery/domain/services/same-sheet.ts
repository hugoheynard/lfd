/**
 * **Deux fiches disent-elles la même chose ?** Égalité structurelle de deux
 * valeurs de données (objets, tableaux, primitives, dates) : une correction
 * qui repose la fiche telle qu'elle est ne change rien, et ne doit ni écrire
 * ni journaliser — c'est ce qui rend un « Enregistrer » rejoué sans effet.
 *
 * L'ordre des clés d'un objet ne compte pas ; celui d'un tableau, si. Une
 * clé absente et une clé à `undefined` sont la même chose.
 */
export function sameSheet(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (left instanceof Date || right instanceof Date) {
    return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameSheet(item, right[index]))
    );
  }
  if (isRecord(left) && isRecord(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].every((key) => sameSheet(left[key], right[key]));
  }
  return false;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}
