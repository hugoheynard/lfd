/**
 * Inscrit au journal qu'un fichier des comptes — fait d'IBAN en clair — vient
 * d'être servi (doc `prerequis-export-ribs.md` § 2.3, R8). Envoyée par la
 * route du fichier APRÈS l'avoir calculé : un refus (409) n'est pas un
 * téléchargement.
 */
export class RecordAccountBankExportDownloadCommand {
  constructor(
    readonly legalEntityId: string,
    readonly exportId: string,
    readonly staffUserId: string,
  ) {}
}
