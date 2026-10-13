/** Le manifeste d'un transfert interne (lot T1) : ce qu'il transporte. */
export class GetInternalTransferManifestQuery {
  constructor(readonly transferId: string) {}
}
