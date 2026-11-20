/**
 * Ce qu'il faut lire du manque de la commande (son rang 1) pour dire qu'il
 * attend une décision — les deux colonnes que `OrderShortfall` relit.
 */
export interface AwaitingShortfallRow {
  readonly status: string;
  /** Le manque du rang 1, s'il en a un (au plus une ligne). */
  readonly shortfalls: readonly {
    readonly reportedAt: Date | null;
    readonly decidedAt: Date | null;
  }[];
}

/**
 * **Un manque signalé attend la décision du superviseur** — la même règle que
 * `OrderShortfall.awaitingDecision` (un signal en vigueur, pas encore décidé),
 * appliquée à la ligne lue pour le retrait et la file du comptoir.
 *
 * Une commande annulée n'attend plus aucune décision, comme à la Supervision
 * (`awaitingDecisionOf`) : le comptoir dit « annulée », pas « décision
 * attendue ».
 *
 * Le manque d'un reste (rang > 1) n'est pas lu ici : le sujet du retrait le
 * porte pour la commande, c'est-à-dire son rang 1.
 */
export function awaitingShortfallDecisionOf(row: AwaitingShortfallRow): boolean {
  const shortfall = row.shortfalls[0];
  return (
    row.status !== "cancelled" &&
    row.status !== "no_show" &&
    shortfall !== undefined &&
    shortfall.reportedAt !== null &&
    shortfall.decidedAt === null
  );
}
