/** **Retirer une fiche de fonction** — archivage, jamais effacement. */
export class ArchiveFunctionSheetCommand {
  constructor(
    readonly eventId: string,
    readonly sheetId: string,
  ) {}
}
