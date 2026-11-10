import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **PDF de référence des CGV** (plan
 * `legal/plan-cgv-par-audience.md`, C3). Lus par le staff qui dépose le
 * fichier, ou par un client qui veut le télécharger : chacun nomme le cas réel
 * et le geste qui en sort.
 */

/** Le fichier déposé n'est pas un PDF recevable — **400**. */
export class InvalidLegalPdfError extends DomainError {
  constructor(reason: string) {
    super(
      "legal_document_file.invalid",
      `Ce fichier ne peut pas servir de document de référence des CGV : ${reason} ` +
        "Exportez le document des juristes en PDF, puis déposez-le de nouveau.",
    );
  }
}

/** Aucun PDF n'a encore été déposé pour ce texte — **404**. */
export class NoLegalDocumentFileError extends ResourceNotFoundError {
  constructor(readonly documentTitle: string) {
    super(
      "legal_document_file.none",
      `Aucun document PDF n'est encore publié pour « ${documentTitle} ». ` +
        "Le texte en ligne reste consultable sur la page.",
    );
  }
}

/** Le fichier demandé n'existe pas pour ce texte — **404**. */
export class UnknownLegalDocumentFileError extends ResourceNotFoundError {
  constructor(
    readonly fileId: string,
    readonly documentTitle: string,
  ) {
    super(
      "legal_document_file.unknown",
      `Aucun document PDF « ${fileId} » pour « ${documentTitle} » : ` +
        "vérifiez le lien, ou repartez de l'historique des dépôts.",
    );
  }
}

/**
 * Le PDF visé est déjà remplacé — **409**. Le cas courant : deux dépôts
 * simultanés, dont un seul peut remplacer le PDF en vigueur.
 */
export class LegalDocumentFileAlreadySupersededError extends BusinessError {
  constructor(readonly documentTitle: string) {
    super(
      "legal_document_file.already_superseded",
      `Le document PDF de « ${documentTitle} » vient d'être remplacé par un autre dépôt. ` +
        "Rafraîchissez l'écran pour voir lequel est en vigueur avant de déposer de nouveau.",
    );
  }
}
