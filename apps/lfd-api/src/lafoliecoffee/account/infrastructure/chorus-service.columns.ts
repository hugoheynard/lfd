/** Le jour d'une colonne `DATE`, posé à minuit UTC. */
export function dayColumn(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** `AAAA-MM-JJ` d'une colonne `DATE` lue à minuit UTC, ou `null`. */
export function dayOfColumn(column: Date | null): string | null {
  return column === null ? null : column.toISOString().slice(0, 10);
}
