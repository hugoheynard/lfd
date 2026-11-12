/**
 * **Deux valeurs portent-elles la même donnée ?** Une égalité de structure,
 * pour qu'une écriture rejouée se reconnaisse (« rien n'a changé ») sans que
 * chaque réglage recopie la liste de ses champs.
 *
 * - les objets se comparent clé par clé, sans égard à l'ordre — une ligne
 *   relue d'un `jsonb` ne rend pas ses clés dans l'ordre de la saisie ;
 * - une clé à `undefined` vaut une clé absente (`exactOptionalPropertyTypes`
 *   les distingue au type, pas à la donnée) ;
 * - les tableaux se comparent dans l'ordre : un ordre est une donnée ;
 * - les dates, par leur instant.
 *
 * Elle ne sait rien des invariants : elle dit seulement si deux états sont
 * identiques. Dans le doute (un type qu'elle ne connaît pas), elle répond
 * « différent » — l'écriture a alors lieu, comme si la comparaison n'existait
 * pas.
 */
export function sameStructure(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
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
      left.every((item, index) => sameStructure(item, right[index]))
    );
  }
  if (isRecord(left) && isRecord(right)) {
    return sameRecord(left, right);
  }
  return false;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function sameRecord(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean {
  const keys = new Set([...definedKeys(left), ...definedKeys(right)]);
  return [...keys].every((key) => sameStructure(left[key], right[key]));
}

function definedKeys(record: Readonly<Record<string, unknown>>): string[] {
  return Object.keys(record).filter((key) => record[key] !== undefined);
}
