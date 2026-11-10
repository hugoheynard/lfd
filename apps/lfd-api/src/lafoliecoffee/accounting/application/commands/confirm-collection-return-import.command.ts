/**
 * Enregistre les retours qu'un fichier de la banque apparie (R5b), pour les
 * seules transactions que le staff a retenues à l'aperçu. Le fichier est relu :
 * on ne fait pas confiance à ce que l'écran renverrait de l'aperçu.
 */
export class ConfirmCollectionReturnImportCommand {
  constructor(
    readonly xml: string,
    readonly endToEndIds: readonly string[],
    readonly staffUserId: string,
  ) {}
}
