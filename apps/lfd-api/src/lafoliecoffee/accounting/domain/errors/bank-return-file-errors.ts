import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus de la lecture d'un fichier de retours de la banque (plan
 * `retours-bancaires.md`). Le staff lit le message sans le code :
 * il dit ce qui cloche dans le fichier, et quoi faire.
 */

/** Le fichier n'est pas un `pain.002` ni un `camt.054` lisible. */
export class InvalidBankReturnFileError extends DomainError {
  constructor(readonly why: string) {
    super(
      "accounting.collection_return.invalid_file",
      `Fichier de retours illisible : ${why}. Vérifier qu'il s'agit bien du pain.002 ou du camt.054 téléchargé du portail de la banque, sinon saisir le retour à la main.`,
    );
  }
}

/** Une transaction retenue à la confirmation ne s'enregistrerait pas. */
export class ImportEntryNotRecordableError extends BusinessError {
  constructor(
    readonly endToEndId: string,
    readonly problem: string,
  ) {
    super(
      "accounting.collection_return.import_entry_not_recordable",
      `La transaction ${endToEndId} ne peut pas être enregistrée : ${problem}. Relancer l'aperçu, ne retenir que les transactions appariées.`,
    );
  }
}
