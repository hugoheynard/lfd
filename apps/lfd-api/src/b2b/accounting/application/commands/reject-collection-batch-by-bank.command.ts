/**
 * « La banque a rejeté ce fichier » : le lot déposé dont la banque a refusé
 * le fichier entier (accusé PSR1). `reason` est le motif recopié de l'accusé.
 */
export class RejectCollectionBatchByBankCommand {
  constructor(
    readonly batchId: string,
    readonly reason: string,
    readonly staffUserId: string,
  ) {}
}
