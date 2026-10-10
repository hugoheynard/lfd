/**
 * Un jour civil ↔ une colonne `date`.
 *
 * Prisma rend une colonne `@db.Date` comme un instant à minuit UTC, et en
 * attend un. Ce n'est PAS un instant de Paris : c'est l'encodage d'un jour sans
 * heure, qu'on relit tel quel — aucune conversion de fuseau n'y a sa place.
 */
const DAY_LENGTH = 10;

export function dayColumn(day: string | null): Date | null {
  return day === null ? null : dayValue(day);
}

/** Un jour `AAAA-MM-JJ` déjà validé, tel que la colonne `date` l'attend. */
export function dayValue(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1));
}

export function readDayColumn(column: Date | null): string | null {
  return column === null ? null : column.toISOString().slice(0, DAY_LENGTH);
}
