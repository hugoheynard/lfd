/** Révoquer une clé de lecture de l'export des ventes. */
export class RevokeExportReaderKeyCommand {
  constructor(
    readonly keyId: string,
    /** La fiche du staff qui agit : l'auteur de la révocation et l'acteur de l'intention. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (`Idempotency-Key`). */
    readonly intentKey: string,
  ) {}
}
