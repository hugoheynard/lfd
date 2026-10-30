/**
 * **Les promotions, pour l'écran** — toutes, archivées comprises, rangées
 * par l'écran. `pickupId` restreint à celles qui visent ce point de retrait
 * (le raccourci de la fiche du site, plan § 13.9).
 */
export class ListPromotionsQuery {
  constructor(readonly pickupId: string | null) {}
}
