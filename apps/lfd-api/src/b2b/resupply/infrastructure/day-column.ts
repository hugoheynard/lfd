/**
 * **La journée civile en colonne `DATE`**, dans les deux sens — partagée par
 * les réassorts et les reçus du point (elle était recopiée dans chacun
 * jusqu'au 2026-11-02).
 *
 * Écrite à minuit UTC, que Postgres tronque au jour ; relue par sa date UTC,
 * qui est donc la journée écrite, quel que soit le fuseau du serveur.
 */
export function dayColumn(serviceDay: string): Date {
  return new Date(`${serviceDay}T00:00:00.000Z`);
}

/** La colonne `DATE` relue → la journée `AAAA-MM-JJ`. */
export function serviceDayOfColumn(column: Date): string {
  return column.toISOString().slice(0, 10);
}
