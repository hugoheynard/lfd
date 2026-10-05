/** L'écran du cycle : les lots d'une entité, et les commandes écartées. */
export class GetCollectionCycleQuery {
  constructor(readonly legalEntityId: string) {}
}

/** Le fichier STOCKÉ d'un lot — relu, jamais rendu de nouveau. */
export class ExportCollectionBatchFileQuery {
  constructor(readonly batchId: string) {}
}

/** Le CSV de contrôle d'un lot, depuis ses lignes figées. */
export class ExportCollectionBatchAuditQuery {
  constructor(readonly batchId: string) {}
}
