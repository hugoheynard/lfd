/**
 * **Les promotions, pour l'écran** — toutes, archivées comprises, rangées
 * par l'écran. `pickupId` restreint à celles qui visent ce point de retrait
 * (le filtre par point de l'écran Promotions, `promotions.md`, § 2.9) ; `companyId` à celles
 * dont le public nomme cette société (L8b, § 15.5).
 */
export class ListPromotionsQuery {
  constructor(
    readonly pickupId: string | null,
    readonly companyId: string | null = null,
  ) {}
}
