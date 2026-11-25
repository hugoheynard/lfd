/** Les octets d'une fiche de fonction en vigueur, pour la télécharger. */
export class GetFunctionSheetFileQuery {
  constructor(
    readonly eventId: string,
    readonly sheetId: string,
  ) {}
}
