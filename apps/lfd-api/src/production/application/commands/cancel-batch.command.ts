/**
 * **Annuler une fournée** saisie par erreur — entière, tracée, jamais supprimée
 * (plan `plan-fournees-progressives.md`, D3). Pour corriger 48 en 36 : annuler,
 * redéclarer 36.
 *
 * Tout poste du fournil peut annuler la fournée d'un autre (Hugo, 2026-09-28,
 * Q3) : l'annulation porte SON auteur, pas celui de la fournée.
 */
export class CancelBatchCommand {
  constructor(
    readonly serviceDay: string,
    readonly batchId: string,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
  ) {}
}
