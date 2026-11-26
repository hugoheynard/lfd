/**
 * **Réémettre** un récapitulatif (`plan-restaurants-maison.md`, D8) : un
 * rectificatif sur les BL d'aujourd'hui, qui remplace l'ancien. Une fois par
 * intention de l'écran.
 */
export class ReissueInHouseRecapCommand {
  constructor(
    readonly recapId: string,
    readonly staffUserId: string,
    readonly intentKey: string,
  ) {}
}
