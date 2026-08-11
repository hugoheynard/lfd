import { TechnicalError } from "./app-error.js";

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
