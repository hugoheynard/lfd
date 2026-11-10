/**
 * « Clients à tarif négocié : N mercuriales acceptent cette promotion » — la
 * ligne d'information de la page de promotion (`plan-la-mercuriale-decide.md`, § 7).
 */
export class ListMercurialesAcceptingPromotionQuery {
  constructor(readonly promotionId: string) {}
}
