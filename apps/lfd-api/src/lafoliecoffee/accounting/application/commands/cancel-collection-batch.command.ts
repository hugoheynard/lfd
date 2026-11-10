/** Annule un lot constitué, avant dépôt : ses commandes repassent à prélever. */
export class CancelCollectionBatchCommand {
  constructor(
    readonly batchId: string,
    readonly staffUserId: string,
  ) {}
}
