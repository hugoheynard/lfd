/**
 * Inscrit au journal qu'un fichier des mandats — fait d'IBAN en clair — vient
 * d'être servi (doc `prerequis-export-ribs.md` § 5, R8, volet mandats).
 * Envoyée par la route du fichier APRÈS l'avoir calculé : un refus (409)
 * n'est pas un téléchargement.
 */
export class RecordMandateBankExportDownloadCommand {
  constructor(
    readonly legalEntityId: string,
    readonly exportId: string,
    readonly staffUserId: string,
  ) {}
}
