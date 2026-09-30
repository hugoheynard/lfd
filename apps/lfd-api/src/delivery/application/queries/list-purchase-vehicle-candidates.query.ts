/** La liste des véhicules candidats ; les archivés sur demande. */
export class ListPurchaseVehicleCandidatesQuery {
  constructor(readonly includeArchived: boolean) {}
}
