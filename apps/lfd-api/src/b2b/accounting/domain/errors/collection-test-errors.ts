import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **prélèvement d'essai** (plan
 * `documentation/comptabilite/prelevement/plan-prelevement-d-essai.md`). Lus
 * par la comptabilité sans le code sous les yeux : chacun nomme le cas et le
 * geste de sortie. Aucun ne porte d'IBAN — un message part au client HTTP tel
 * quel.
 */

/** Le montant sort de ]0 ; plafond] (Q2, Hugo 2026-10-22). */
export class CollectionTestAmountOutOfRangeError extends DomainError {
  constructor(
    readonly amountCents: number,
    readonly maxCents: number,
  ) {
    super(
      "accounting.collection_test.amount_out_of_range",
      `Montant refusé (${String(amountCents)} centimes) : un prélèvement d'essai est strictement positif et ne dépasse pas ${String(maxCents)} centimes. Saisir un montant entre 1 et ${String(maxCents)} centimes.`,
    );
  }
}

/** L'échéance tombe avant le délai du calendrier des lots. */
export class CollectionTestDayTooEarlyError extends DomainError {
  constructor(
    readonly day: string,
    readonly earliest: string,
  ) {
    super(
      "accounting.collection_test.day_too_early",
      `Échéance refusée (${day}) : le calendrier des prélèvements ne permet pas une échéance avant le ${earliest}. Choisir le ${earliest} ou une date ultérieure.`,
    );
  }
}

/** L'échéance tombe un jour où TARGET2 est fermé. */
export class CollectionTestDayClosedError extends DomainError {
  constructor(
    readonly day: string,
    readonly next: string,
  ) {
    super(
      "accounting.collection_test.day_closed",
      `Échéance refusée (${day}) : ce n'est pas un jour ouvré du système de règlement (TARGET2). Choisir le ${next}.`,
    );
  }
}

/** La séquence contredit le type de paiement du mandat. */
export class CollectionTestSequenceMismatchError extends DomainError {
  constructor(
    readonly sequence: string,
    readonly mandateReference: string,
    readonly allowed: readonly string[],
  ) {
    super(
      "accounting.collection_test.sequence_mismatch",
      `Séquence ${sequence} refusée : le mandat ${mandateReference} ne l'autorise pas. Séquences possibles sur ce mandat : ${allowed.join(", ")}.`,
    );
  }
}

/** `OOFF` sur un mandat ponctuel qu'un lot réel a déjà pris. */
export class CollectionTestOneOffUsedError extends BusinessError {
  constructor(readonly mandateReference: string) {
    super(
      "accounting.collection_test.one_off_used",
      `Séquence OOFF refusée : le mandat ponctuel ${mandateReference} figure déjà dans un lot de prélèvement réel, et un mandat ponctuel ne sert qu'une fois. Faire signer un mandat ponctuel dédié aux essais.`,
    );
  }
}

/** La société n'est pas déclarée parmi nos établissements (Q1). */
export class NotOwnEstablishmentError extends BusinessError {
  constructor(readonly companyName: string) {
    super(
      "accounting.collection_test.not_own_establishment",
      `« ${companyName} » n'est pas déclarée parmi nos établissements : un prélèvement d'essai ne vise que nos propres sociétés. La déclarer dans Comptabilité › Nos établissements, si elle est bien à nous.`,
    );
  }
}

/** La société n'est pas active. */
export class CollectionTestDebtorInactiveError extends BusinessError {
  constructor(
    readonly companyName: string,
    readonly status: string,
  ) {
    super(
      "accounting.collection_test.debtor_inactive",
      `« ${companyName} » n'est pas un compte client actif (statut : ${status}) : on ne prélève, même à l'essai, qu'une société active. L'activer depuis sa fiche, ou choisir un autre établissement.`,
    );
  }
}

/** Aucun mandat actif, avec son compte recopié et son créancier. */
export class CollectionTestNoMandateError extends BusinessError {
  constructor(readonly companyName: string) {
    super(
      "accounting.collection_test.no_mandate",
      `« ${companyName} » n'a aucun mandat de prélèvement signé et actif chez une de nos entités (ou son RIB n'est pas recopié). Faire signer le mandat depuis la fiche de la société.`,
    );
  }
}

/** Plusieurs mandats actifs : choisir serait deviner le créancier. */
export class CollectionTestAmbiguousMandateError extends BusinessError {
  constructor(
    readonly companyName: string,
    readonly references: readonly string[],
  ) {
    super(
      "accounting.collection_test.ambiguous_mandate",
      `« ${companyName} » a plusieurs mandats actifs (${references.join(", ")}) : l'essai ne choisit pas à votre place sous quel mandat prélever. Révoquer celui qui ne sert plus.`,
    );
  }
}

/** Le libellé ne garde aucun caractère du jeu SEPA. */
export class CollectionTestRemittanceEmptyError extends DomainError {
  constructor() {
    super(
      "accounting.collection_test.remittance_empty",
      "Libellé refusé : il ne contient aucun caractère que la banque accepte (lettres sans accent, chiffres, ponctuation simple). Laisser le libellé vide pour « ESSAI PRELEVEMENT ».",
    );
  }
}

/** L'identifiant d'un essai n'est pas un ULID : les références SEPA en dériveraient mal. */
export class InvalidCollectionTestIdError extends TechnicalError {
  constructor(readonly id: string) {
    super(
      "accounting.collection_test.invalid_id",
      `L'identifiant d'essai « ${id} » n'a pas la forme attendue (ULID) : aucune référence SEPA n'a été produite. Relancer la génération ; si le refus revient, le signaler à l'équipe technique.`,
    );
  }
}

/** Le contrôle relu dans le fichier ne retrouve pas ses totaux. */
export class CollectionTestFileIncoherentError extends TechnicalError {
  constructor() {
    super(
      "accounting.collection_test.file_incoherent",
      "Le fichier d'essai n'a pas passé son contrôle (le total ou le nombre de lignes déclarés ne correspondent pas aux lignes) : il n'a pas été gardé. Le signaler à l'équipe technique, sans déposer de fichier.",
    );
  }
}

/** Société inconnue. */
export class CollectionTestCompanyNotFoundError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super(
      "accounting.collection_test.company_not_found",
      `Aucune société ne porte l'identifiant « ${companyId} ». Rouvrir la liste et choisir de nouveau.`,
    );
  }
}

/** Le créancier du mandat est introuvable. */
export class CollectionTestCreditorNotFoundError extends ResourceNotFoundError {
  constructor(readonly mandateReference: string) {
    super(
      "accounting.collection_test.creditor_not_found",
      `L'entité émettrice du mandat ${mandateReference} est introuvable : aucun fichier ne peut nommer son créancier. Vérifier le mandat sur la fiche de la société.`,
    );
  }
}

/** Essai inconnu. */
export class CollectionTestNotFoundError extends ResourceNotFoundError {
  constructor(readonly id: string) {
    super(
      "accounting.collection_test.not_found",
      `Aucun prélèvement d'essai ne porte l'identifiant « ${id} ». Rouvrir la liste des essais.`,
    );
  }
}

/** « Marqué remboursé » une seconde fois. */
export class CollectionTestAlreadyRefundedError extends BusinessError {
  constructor(readonly refundedOn: string) {
    super(
      "accounting.collection_test.already_refunded",
      `Cet essai est déjà marqué remboursé (le ${refundedOn}). Rien à refaire.`,
    );
  }
}

/** Rien à rembourser : pas encore échu, ou la banque a déjà rendu l'argent. */
export class CollectionTestNothingToRefundError extends BusinessError {
  constructor(readonly why: string) {
    super(
      "accounting.collection_test.nothing_to_refund",
      `Rien à rembourser sur cet essai : ${why}.`,
    );
  }
}

/** Le jour du remboursement est dans le futur, ou avant l'échéance. */
export class CollectionTestRefundDayInvalidError extends DomainError {
  constructor(
    readonly refundedOn: string,
    readonly why: string,
  ) {
    super(
      "accounting.collection_test.refund_day_invalid",
      `Date de remboursement refusée (${refundedOn}) : ${why}. Saisir le jour où le virement a réellement été fait.`,
    );
  }
}

/** Un second retour bancaire pour le même essai. */
export class CollectionTestAlreadyReturnedError extends BusinessError {
  constructor(readonly endToEndId: string) {
    super(
      "accounting.collection_test.already_returned",
      `Un retour bancaire est déjà rattaché à l'essai ${endToEndId}. Rien à refaire.`,
    );
  }
}

/** La société est déjà déclarée parmi nos établissements. */
export class OwnEstablishmentAlreadyDeclaredError extends BusinessError {
  constructor(readonly companyName: string) {
    super(
      "accounting.own_establishment.already_declared",
      `« ${companyName} » est déjà déclarée parmi nos établissements. Rien à refaire.`,
    );
  }
}

/** Retirer une société qui n'est pas (ou plus) déclarée. */
export class OwnEstablishmentNotDeclaredError extends BusinessError {
  constructor(readonly companyName: string) {
    super(
      "accounting.own_establishment.not_declared",
      `« ${companyName} » n'est pas déclarée parmi nos établissements : il n'y a rien à retirer.`,
    );
  }
}

/** Le fichier gardé ne correspond plus à son empreinte. */
export class CollectionTestFileTamperedError extends TechnicalError {
  constructor(readonly messageId: string) {
    super(
      "accounting.collection_test.file_tampered",
      `Le fichier gardé de l'essai ${messageId} ne correspond plus à son empreinte : il n'est pas rendu. Ne déposer aucune copie de ce fichier, et le signaler à l'équipe technique.`,
    );
  }
}
