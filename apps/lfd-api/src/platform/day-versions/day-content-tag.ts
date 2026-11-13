import { InvalidDayContentTagError } from "./invalid-day-content-tag.error.js";

/** Le numéro d'un sujet de journée, lu en base avant les données de l'écran. */
export interface DaySubjectVersion {
  readonly subject: string;
  readonly version: number;
}

const SUBJECT = /^[a-z][a-z0-9-]{0,31}$/u;

/**
 * **L'étiquette d'un contenu de journée** : les numéros en clair, sujets triés
 * (`orders:12.production:4`) — la forme que l'objet exige
 * (`container/day-contents-store.ts`, `parseDayContentTag`). Aucun hachage :
 * une collision servirait un mauvais contenu en silence. Le tri rend
 * l'étiquette indépendante de l'ordre dans lequel l'écran nomme ses sujets.
 *
 * @throws {InvalidDayContentTagError} liste vide, sujet mal formé ou en double, numéro invalide.
 */
export function dayContentTagOf(versions: readonly DaySubjectVersion[]): string {
  if (versions.length === 0) {
    throw new InvalidDayContentTagError("aucun sujet");
  }
  const sorted = [...versions].sort((a, b) => (a.subject < b.subject ? -1 : 1));
  sorted.forEach((entry, index) => {
    if (!SUBJECT.test(entry.subject)) {
      throw new InvalidDayContentTagError(`sujet « ${entry.subject} »`);
    }
    if (!Number.isSafeInteger(entry.version) || entry.version < 0) {
      throw new InvalidDayContentTagError(`numéro de ${entry.subject}`);
    }
    if (index > 0 && sorted[index - 1]?.subject === entry.subject) {
      throw new InvalidDayContentTagError(`sujet ${entry.subject} en double`);
    }
  });
  return sorted.map((entry) => `${entry.subject}:${entry.version}`).join(".");
}
