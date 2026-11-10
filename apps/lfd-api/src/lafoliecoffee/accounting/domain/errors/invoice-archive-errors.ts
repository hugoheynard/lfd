import {
  BusinessError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **zip de « Mes factures »** (plan `plan-page-mes-factures.md`,
 * lot P2, §7.5). Un zip est entier ou n'est pas : chaque refus NOMME les
 * pièces en cause, jamais un zip incomplet servi en 200.
 */

/** Plus de pièces que le plafond : on resserre la période, on ne tronque pas. */
export class InvoiceArchiveTooLargeError extends BusinessError {
  constructor(
    readonly count: number,
    readonly max: number,
  ) {
    super(
      "accounting.invoice_archive.too_large",
      `Ce téléchargement regrouperait ${String(count)} pièces ; un zip en porte ${String(max)} au plus. Choisir une année ou un mois, ou sélectionner moins de pièces, puis recommencer.`,
    );
  }
}

/** Aucune pièce ne répond au filtre : un zip vide ne se télécharge pas. */
export class InvoiceArchiveEmptyError extends BusinessError {
  constructor() {
    super(
      "accounting.invoice_archive.empty",
      "Aucune facture ni aucun avoir ne correspond à ce filtre : il n'y a rien à télécharger. Élargir l'année, le mois ou le genre de pièce.",
    );
  }
}

/**
 * Des ids de la sélection ne désignent aucune pièce visible par la société —
 * absente, ou adressée à un autre : le même refus, pour ne rien dire des
 * pièces des autres.
 */
export class InvoiceArchiveNotVisibleError extends ResourceNotFoundError {
  constructor(readonly invoiceIds: readonly string[]) {
    super(
      "accounting.invoice_archive.not_visible",
      `Pièce(s) introuvable(s) pour cette société : ${invoiceIds.join(", ")}. Rouvrir la liste des factures et refaire la sélection.`,
    );
  }
}

/** Des pièces retenues n'ont pas encore leur PDF : le zip attend le rendu. */
export class InvoiceArchiveNotRenderedError extends BusinessError {
  constructor(readonly invoiceNumbers: readonly string[]) {
    super(
      "accounting.invoice_archive.not_rendered",
      `Le PDF de ${invoiceNumbers.join(", ")} n'est pas encore rendu : le zip n'est pas fabriqué. Il se fabrique juste après l'émission ; réessayer dans quelques minutes, ou retirer ces pièces de la sélection.`,
    );
  }
}

/** Des PDF rangés n'ont plus l'empreinte figée : aucun n'est servi. */
export class InvoiceArchiveTamperedError extends TechnicalError {
  constructor(readonly invoiceNumbers: readonly string[]) {
    super(
      "accounting.invoice_archive.tampered",
      `Le PDF rangé de ${invoiceNumbers.join(", ")} ne correspond plus à l'empreinte figée à son rendu : le zip n'est pas servi. Signaler l'incident ; ces pièces restent lisibles à l'écran par leurs données.`,
    );
  }
}
