import {
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus et pannes du **document Factur-X** d'une pièce émise (plan
 * `facture-emise.md`). Le rendu se fait après
 * l'émission : une pièce sans document est un état normal et visible, pas
 * une panne.
 */

/** La pièce existe, son PDF n'est pas encore rangé : le rendu suit l'émission. */
export class InvoiceDocumentNotRenderedError extends ResourceNotFoundError {
  constructor(readonly invoiceNumber: string) {
    super(
      "accounting.invoice.document_not_rendered",
      `Le PDF de la pièce ${invoiceNumber} n'est pas encore rendu. Il se fabrique juste après l'émission : réessayer dans quelques minutes ; s'il manque toujours, le journal de la pièce dit pourquoi (« rendu du PDF en échec »).`,
    );
  }
}

/**
 * Un objet existe déjà sous la clé de la pièce, avec d'autres octets. La clé
 * n'est jamais réécrite : on s'arrête plutôt que d'écraser une pièce gardée.
 */
export class InvoiceDocumentConflictError extends TechnicalError {
  constructor(
    readonly invoiceNumber: string,
    readonly key: string,
  ) {
    super(
      "accounting.invoice.document_conflict",
      `Un document est déjà rangé pour la pièce ${invoiceNumber} avec un contenu différent du rendu : rien n'a été écrasé. Comparer l'objet « ${key} » au rendu avant toute reprise ; ne pas le supprimer.`,
    );
  }
}

/** L'objet rangé n'a plus l'empreinte que la pièce a figée. */
export class InvoiceDocumentTamperedError extends TechnicalError {
  constructor(readonly invoiceNumber: string) {
    super(
      "accounting.invoice.document_tampered",
      `Le PDF rangé de la pièce ${invoiceNumber} ne correspond plus à l'empreinte figée à son rendu : il n'est pas servi. Signaler l'incident ; la pièce reste lisible à l'écran par ses données.`,
    );
  }
}

/** Le XML de la pièce viole une règle arithmétique EN 16931 : on ne rend pas une pièce fausse. */
export class InvoiceXmlInconsistentError extends TechnicalError {
  constructor(
    readonly invoiceNumber: string,
    readonly violations: readonly string[],
  ) {
    super(
      "accounting.invoice.xml_inconsistent",
      `Le XML Factur-X de la pièce ${invoiceNumber} viole ${String(violations.length)} règle(s) EN 16931 (${violations.join(" ; ")}) : le PDF n'est pas rendu. Signaler l'incident ; la pièce émise ne change pas.`,
    );
  }
}

/** Une police de la facture manque sur le disque de l'application. */
export class InvoiceFontsUnavailableError extends TechnicalError {
  constructor(
    readonly path: string,
    cause: unknown,
  ) {
    super(
      "accounting.invoice.fonts_unavailable",
      `La police « ${path} » de la facture est illisible : aucun PDF ne peut être rendu. Vérifier que le dossier fonts/ de l'API est déployé avec elle.`,
      cause,
    );
  }
}
