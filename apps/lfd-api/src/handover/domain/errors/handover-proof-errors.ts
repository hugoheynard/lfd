import { DomainError, TechnicalError } from "../../../platform/shared/errors/app-error.js";

/** Une durée de conservation qui effacerait ce qui vient d'être pris. */
export class HandoverProofRetentionInvalidError extends DomainError {
  constructor(days: number) {
    super(
      "handover.proof_retention_invalid",
      `Une conservation de ${String(days)} jour(s) n'est pas une durée : donnez un nombre entier de jours, au moins 1.`,
    );
  }
}

/**
 * **Une purge qui n'a pas tout effacé.** Les pièces dont une image n'a pas pu
 * être retirée du stockage sont GARDÉES, ligne comprise : c'est la ligne qui
 * porte les clés, et sans elle les images resteraient orphelines, introuvables.
 * Relancer la purge les reprend.
 */
export class HandoverProofPurgeIncompleteError extends TechnicalError {
  constructor(kept: number, cause: unknown) {
    super(
      "handover.proof_purge_incomplete",
      `${String(kept)} pièce(s) de remise n'ont pas pu être effacées : le stockage des images a refusé. Elles sont gardées telles quelles ; relancez la purge une fois le stockage rétabli.`,
      cause,
    );
  }
}
