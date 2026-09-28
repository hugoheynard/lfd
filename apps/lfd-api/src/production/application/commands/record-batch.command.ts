/**
 * **Déclarer une fournée** — « il en est sorti 48 » (plan
 * `plan-fournees-progressives.md`, D3).
 *
 * L'`id` vient du poste (ULID) : c'est la clé d'idempotence. Un double appui ou
 * une requête rejouée après une coupure ne compte pas deux fois.
 */
export class RecordBatchCommand {
  constructor(
    readonly serviceDay: string,
    readonly sku: string,
    readonly batchId: string,
    readonly quantity: number,
    /** Deux lettres au crayon. Vide autorisé : on déclare d'abord, on signe si on veut. */
    readonly initials: string,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
  ) {}
}
