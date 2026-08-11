import { DomainError, TechnicalError } from "./app-error.js";

/**
 * Le stockage objet (R2) n'est pas configuré, ou a échoué.
 *
 * Technique et non métier : personne n'a rien fait de mal. Sans bucket
 * configuré (`STORAGE_*` absents), le dépôt et la relecture des **pièces**
 * (KBIS, mandat signé) sont indisponibles ; le reste de l'app fonctionne.
 */
export class DocumentStorageUnavailableError extends TechnicalError {
  constructor(reason: string, cause?: unknown) {
    super("storage.document.unavailable", reason, cause);
  }
}

/**
 * La pièce déposée n'est pas exploitable : nom vide, fichier vide, trop lourd,
 * ou format non accepté (les octets ne sont ni un PDF ni une image connue).
 *
 * **Domaine** et non technique : c'est une règle du modèle, et le déposant peut
 * la satisfaire en redéposant la bonne pièce.
 */
export class InvalidScannedDocumentError extends DomainError {
  constructor(reason: string) {
    super("storage.document.invalid", `Pièce invalide : ${reason}`);
  }
}
