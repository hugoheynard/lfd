const DAY_LENGTH = 10;

/** `AAAA-MM-JJ` → la colonne `date` (minuit UTC, ce que Prisma écrit pour un `@db.Date`). */
export function dayColumn(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** La colonne `date` → `AAAA-MM-JJ`. */
export function dayOfColumn(column: Date): string {
  return column.toISOString().slice(0, DAY_LENGTH);
}
