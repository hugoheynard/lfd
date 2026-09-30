/** La liste des formats de bacs candidats ; les archivés sur demande. */
export class ListPurchaseBinCandidatesQuery {
  constructor(readonly includeArchived: boolean) {}
}
