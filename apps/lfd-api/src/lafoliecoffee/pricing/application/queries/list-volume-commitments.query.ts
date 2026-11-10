/**
 * « Qu'a promis ce client, et où en est-il ? »
 *
 * Le volume atteint est mesuré et non dérivé de la promesse : c'est l'écart
 * entre les deux qui fait toute l'information de la réponse.
 */
export class ListVolumeCommitmentsQuery {
  constructor(readonly companyId: string) {}
}
