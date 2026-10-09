/** Les retours d'un lot, avec leurs gestes possibles (R5a). */
export class GetBatchCollectionReturnsQuery {
  constructor(readonly batchId: string) {}
}

/** Les retours dont la ligne débitait cette société — la fiche du payeur. */
export class GetPayerCollectionReturnsQuery {
  constructor(readonly companyId: string) {}
}

/**
 * L'aperçu d'un fichier de retours de la banque (R5b) : ce qui s'apparie, ce
 * qui ne s'apparie pas. Une LECTURE — rien n'est écrit avant la confirmation.
 */
export class PreviewCollectionReturnImportQuery {
  constructor(readonly xml: string) {}
}
