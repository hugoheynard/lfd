import { DomainError, TechnicalError } from "./app-error.js";

/**
 * Le stockage objet (R2) n'est pas configuré, ou a échoué.
 *
 * Technique et non métier : personne n'a rien fait de mal. Sans bucket
 * configuré (`R2_KBIS_*` absents), le dépôt et la relecture des **pièces**
 * (KBIS, mandat signé) sont indisponibles ; le reste de l'app fonctionne.
 *
 * Elle couvre aussi le canal **en échec** — bucket inconnu, clé refusée,
 * signature invalide — et pas seulement le canal absent. Sans ça, une panne
 * ordinaire du stockage remontait en `internal.unexpected`, le code réservé à
 * ce qu'on n'a PAS prévu : vus de l'extérieur, un bucket mal nommé et un bug se
 * ressemblaient exactement.
 *
 * ⚠️ Le `STORAGE_*` qu'annonçait la version précédente de ce commentaire ne
 * correspondait à aucune variable lue par le code. C'est la même dérive de
 * nommage qui, dans `container/worker.ts`, empêchait la configuration
 * d'atteindre le container.
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
