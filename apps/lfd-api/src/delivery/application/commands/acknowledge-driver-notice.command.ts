/**
 * **« J'ai compris »** — le livreur accuse la lecture du texte d'information.
 * `staffUserId` est la fiche de la requête : on n'accuse que pour soi.
 */
export class AcknowledgeDriverNoticeCommand {
  constructor(
    readonly staffUserId: string,
    readonly version: number,
  ) {}
}
