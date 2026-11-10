/**
 * Inscrit qu'un fichier de remise — fait d'IBAN en clair — vient d'être servi.
 * Envoyée par la route du fichier APRÈS l'avoir calculé : un refus n'est pas
 * un téléchargement. Elle ouvre « J'ai déposé le fichier dans CENET ».
 */
export class RecordCollectionBatchDownloadCommand {
  constructor(
    readonly batchId: string,
    readonly staffUserId: string,
  ) {}
}
