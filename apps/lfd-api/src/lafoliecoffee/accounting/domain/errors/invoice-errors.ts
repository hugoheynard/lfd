import {
  BusinessError,
  DomainError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";
import type { InvoiceIssuanceBlocker } from "../services/invoice-issuance-blockers.js";

/**
 * Les refus de **la facture et de l'avoir** (plan
 * `documentation/comptabilite/facturation/facture-emise.md`).
 *
 * Trois familles : une donnée mal formée (400) ; un refus que le bureau peut
 * lever en complétant une fiche ou en corrigeant l'avoir (409) ; une facture
 * que le code aurait mal assemblée (500) — personne au bureau ne la corrige,
 * et le message le dit.
 */

/**
 * Un préfixe de numéro qui n'est pas fait de 2 à 6 lettres (lot ZA). Saisi à
 * l'écran de l'entité : le message dit la forme attendue et un exemple.
 */
export class InvalidInvoicePrefixError extends DomainError {
  constructor(readonly raw: string) {
    super(
      "accounting.invoice.prefix_invalid",
      `Préfixe de numéro de facture « ${raw} » invalide : 2 à 6 lettres sans accent, ` +
        "par exemple LFD.",
    );
  }
}

/**
 * Le préfixe d'une entité qui a déjà émis : chaque pièce l'imprime, et la
 * suite de ses numéros doit se lire d'un seul tenant (lot ZA).
 */
export class InvoicePrefixIsFrozenError extends BusinessError {
  constructor(
    readonly entityName: string,
    readonly current: string,
    readonly attempted: string,
  ) {
    super(
      "accounting.invoice.prefix_frozen",
      `L'entité « ${entityName} » a déjà émis des factures numérotées FA-${current}-… : ` +
        `son préfixe ne peut plus devenir ${attempted}. Pour numéroter sous un autre ` +
        "préfixe, déclarez une seconde entité juridique.",
    );
  }
}

/** Deux entités ne partagent pas un préfixe : leurs numéros se confondraient. */
export class InvoicePrefixTakenError extends BusinessError {
  constructor(
    readonly prefix: string,
    readonly holderName: string,
  ) {
    super(
      "accounting.invoice.prefix_taken",
      `Le préfixe ${prefix} est déjà celui de l'entité « ${holderName} » : en choisir un autre.`,
    );
  }
}

/** Un numéro de facture qui n'a pas la forme `FA-<préfixe>-<année>-<n° sur 6 chiffres>`. */
export class InvalidInvoiceNumberError extends DomainError {
  constructor(
    readonly raw: string,
    readonly reason: string,
  ) {
    super(
      "accounting.invoice.number_invalid",
      `Numéro de facture « ${raw} » invalide : ${reason}.`,
    );
  }
}

/** Une quantité de ligne hors de ce qu'une facture peut porter. */
export class InvalidInvoiceQuantityError extends DomainError {
  constructor(
    readonly raw: string,
    readonly reason: string,
  ) {
    super(
      "accounting.invoice.quantity_invalid",
      `Quantité de facture « ${raw} » invalide : ${reason}.`,
    );
  }
}

/** Une donnée de la facture mal formée (date, ligne, document). */
export class InvalidInvoiceError extends DomainError {
  constructor(
    readonly field: string,
    readonly reason: string,
  ) {
    super("accounting.invoice.invalid", `Facture : ${field} — ${reason}.`);
  }
}

/**
 * La facture ne peut pas partir : il manque ce que `invoiceIssuanceBlockers`
 * nomme. Rien n'est comblé ; le message cite chaque manque et son geste.
 */
export class InvoiceIssuanceBlockedError extends BusinessError {
  constructor(readonly blockers: readonly InvoiceIssuanceBlocker[]) {
    super(
      "accounting.invoice.issuance_blocked",
      `La facture ne peut pas être émise : ${blockers.map((b) => b.message).join(" ")}`,
    );
  }
}

/** L'avoir dépasse, sur un taux, ce que la facture corrigée porte encore. */
export class CreditNoteExceedsInvoiceError extends BusinessError {
  constructor(
    readonly correctedNumber: string,
    readonly rate: number,
    readonly reason: string,
  ) {
    super(
      "accounting.invoice.credit_note_exceeds",
      `L'avoir dépasse la facture ${correctedNumber} au taux de ${String(rate)} % (${reason}) : ` +
        "réduire l'avoir à ce qui reste à corriger.",
    );
  }
}

/** Un avoir mal rattaché : à un avoir, à une autre entité, ou daté avant la facture. */
export class InvalidCreditNoteError extends BusinessError {
  constructor(
    readonly correctedNumber: string,
    readonly reason: string,
  ) {
    super(
      "accounting.invoice.credit_note_invalid",
      `Avoir sur la facture ${correctedNumber} refusé : ${reason}.`,
    );
  }
}

/** Le document rendu est déjà attaché : la clé et l'empreinte ne se posent qu'une fois. */
export class InvoiceDocumentAlreadyAttachedError extends BusinessError {
  constructor(readonly invoiceNumber: string) {
    super(
      "accounting.invoice.document_already_attached",
      `Le document de la facture ${invoiceNumber} est déjà attaché : une pièce émise ne se ` +
        "remplace pas. Corriger par un avoir.",
    );
  }
}

/** Les totaux ne se recomposent pas : une ventilation mal assemblée par le code. */
export class InvoiceTotalsMismatchError extends TechnicalError {
  constructor(
    readonly invoiceNumber: string,
    readonly reason: string,
  ) {
    super(
      "accounting.invoice.totals_mismatch",
      `La facture ${invoiceNumber} ne se recompose pas (${reason}) : rien n'est émis. ` +
        "Prévenir l'équipe technique.",
    );
  }
}

/** Une facture que le code a mal assemblée : parties ou numéro qui ne se répondent pas. */
export class InvoiceAssemblyError extends TechnicalError {
  constructor(
    readonly invoiceNumber: string,
    readonly reason: string,
  ) {
    super(
      "accounting.invoice.assembly",
      `La facture ${invoiceNumber} est mal assemblée (${reason}) : rien n'est émis. ` +
        "Prévenir l'équipe technique.",
    );
  }
}

/**
 * Une facture relue dont la forme n'est plus lisible (`body_version` inconnue,
 * JSON qui ne passe pas le schéma, totaux qui ne se recomposent plus). Rien
 * n'est rendu plutôt qu'un montant deviné.
 */
export class UnreadableInvoiceError extends TechnicalError {
  constructor(
    readonly invoiceId: string,
    readonly reason: string,
  ) {
    super(
      "accounting.invoice.unreadable",
      `La facture ${invoiceId} est illisible (${reason}) : rien n'est affiché plutôt qu'un montant deviné. Prévenir l'équipe technique.`,
    );
  }
}

/**
 * La numérotation est chronologique : une pièce ne se date pas avant la
 * dernière émise par la même séquence.
 */
export class InvoiceIssuedBeforePreviousError extends BusinessError {
  constructor(
    readonly legalEntityId: string,
    readonly issuedOn: string,
  ) {
    super(
      "accounting.invoice.issued_before_previous",
      `Une facture de l'entité ${legalEntityId} a déjà été émise après le ${issuedOn} : ` +
        "la numérotation est chronologique, émettre à la date du jour.",
    );
  }
}
