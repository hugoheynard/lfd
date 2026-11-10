import type { TestSubject } from "../../domain/events/collection-test.events.js";
import type { ExportEntity } from "../../domain/events/mandate-bank-export.events.js";

/**
 * Inscrit au journal que le RIB d'un de nos établissements — un IBAN en clair
 * — vient d'être servi pour un essai. Envoyée par la route APRÈS avoir calculé
 * le fichier, comme celle de l'export réel : un refus n'est pas un
 * téléchargement.
 */
export class RecordCollectionTestBankAccountDownloadCommand {
  constructor(
    readonly company: TestSubject,
    readonly legalEntity: ExportEntity,
    readonly staffUserId: string,
  ) {}
}
