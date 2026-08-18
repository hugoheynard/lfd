/** La clause d'archivage datée, telle que Prisma l'attend. */
export interface UnarchivedAtClause {
  OR: [{ archivedAt: null }, { archivedAt: { gt: Date } }];
}

/**
 * **Ce qui n'était pas encore rangé à cet instant.**
 *
 * `archived_at IS NULL` seul appauvrissait le passé : une règle rangée hier
 * s'appliquait le mois dernier, et l'exclure d'une lecture datée effaçait
 * silencieusement une décision qui a bel et bien facturé — sans que rien ne le
 * signale à l'écran.
 *
 * Écrit **une fois** et partagé par les deux lecteurs : la première version de
 * ce correctif ne vivait que dans le lecteur du tableau, pendant que les règles
 * et les planchers gardaient l'ancienne clause. Deux vérités sur « depuis quand
 * cette décision a-t-elle disparu » ne se remarquent que le jour où elles
 * divergent, et ce jour-là c'est un prix qu'on n'explique plus.
 */
export function unarchivedAt(at: Date): UnarchivedAtClause {
  return { OR: [{ archivedAt: null }, { archivedAt: { gt: at } }] };
}
