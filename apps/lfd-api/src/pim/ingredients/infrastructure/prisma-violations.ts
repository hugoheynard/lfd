/**
 * Les deux violations Postgres que ce référentiel sait nommer.
 *
 * Elles sont lues sur le CODE Prisma et non sur le message : un message est du
 * texte localisé par la version du moteur, un code est un contrat.
 */

/** Violation d'unicité — le `23505` de Postgres. Ici : deux fois la même identité. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

/** Violation de clé étrangère — le `23503`. Ici : une ligne encore citée. */
export function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
}
