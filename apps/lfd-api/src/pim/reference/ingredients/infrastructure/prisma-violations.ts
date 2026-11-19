/**
 * La violation de clé étrangère, que ce référentiel est seul à nommer — celle
 * d'unicité est commune au référentiel (`shared/json-readers.ts`).
 *
 * Lue sur le CODE Prisma et non sur le message : un message est du texte
 * localisé par la version du moteur, un code est un contrat.
 */

/** Violation de clé étrangère — le `23503`. Ici : une ligne encore citée. */
export function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
}
