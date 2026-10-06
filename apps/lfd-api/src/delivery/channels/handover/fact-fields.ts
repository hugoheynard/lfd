/**
 * Lecture défensive des champs d'un fait durable de la livraison, côté abonné.
 * `null` : le champ manque ou n'a pas sa forme — l'appelant lève son erreur.
 */
export function textOf(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export function instantOf(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

export function textsOf(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((item): item is string => typeof item === "string")
    ? value
    : null;
}
