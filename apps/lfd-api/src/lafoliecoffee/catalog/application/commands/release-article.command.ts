/**
 * Retire la réservation d'un article à une société (plan
 * `documentation/catalogue/plan-articles-sur-mesure.md`, lot L1a).
 *
 * ⚠️ Irréversible côté client une fois le mur en place : sans autre
 * réservataire, l'article s'ouvre à tous les pros (§ 4). L'écran le fait
 * confirmer ; le journal garde le geste.
 */
export class ReleaseArticleCommand {
  constructor(
    readonly sku: string,
    readonly companyId: string,
  ) {}
}
