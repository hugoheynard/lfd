import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus de l'**export des mandats pour la banque** (plan
 * `export-des-mandats-pour-la-banque.md`). Lus par la comptabilité sans
 * le code sous les yeux : chacun nomme le cas et le geste de sortie. Aucun ne
 * porte d'IBAN — un message part au client HTTP tel quel.
 */

/** Rien à exporter : tous les mandats actifs sont déjà importés, ou écartés. */
export class NothingToExportToBankError extends BusinessError {
  constructor() {
    super(
      "accounting.mandate_bank_export.nothing_to_export",
      "Aucun mandat à exporter : tous les mandats actifs de l'entité sont déjà importés à la banque, ou écartés (voir la liste). Pour renvoyer tous les mandats actifs, cocher « tous les mandats actifs ».",
    );
  }
}

/** Un même mandat deux fois dans un export : un appelant a mal assemblé. */
export class DuplicateMandateInBankExportError extends DomainError {
  constructor(readonly reference: string) {
    super(
      "accounting.mandate_bank_export.duplicate_mandate",
      `Le mandat ${reference} figure deux fois dans l'export : un mandat ne se déclare qu'une fois à la banque. Préparer l'export à nouveau.`,
    );
  }
}

/** L'export est déjà marqué importé. */
export class BankExportAlreadyImportedError extends BusinessError {
  constructor(readonly importedAt: Date) {
    super(
      "accounting.mandate_bank_export.already_imported",
      `Cet export est déjà marqué importé à la banque (le ${importedAt.toISOString()}). Rien à refaire : ses mandats ne ressortiront que si leur compte change.`,
    );
  }
}

/** L'entité n'a pas d'ICS : la colonne B, obligatoire, serait vide. */
export class BankExportWithoutCreditorIdentifierError extends BusinessError {
  constructor(readonly entityName: string) {
    super(
      "accounting.mandate_bank_export.no_ics",
      `L'entité « ${entityName} » n'a pas d'identifiant créancier SEPA (ICS) : la banque l'exige pour chaque mandat. Attribuer l'ICS sur la fiche de l'entité, puis préparer l'export.`,
    );
  }
}

/**
 * Le fichier ne correspond plus aux mandats : un compte a changé, ou un mandat
 * n'est plus actif (ou plus exportable) depuis l'export.
 */
export class BankExportOutdatedError extends BusinessError {
  constructor(readonly references: readonly string[]) {
    super(
      "accounting.mandate_bank_export.outdated",
      `Le fichier de cet export ne correspond plus aux mandats : ${references.join(", ")} (compte changé, mandat révoqué ou devenu inexportable). Préparer un nouvel export — celui-ci ne se télécharge plus.`,
    );
  }
}

/** L'export n'existe pas, ou pas pour cette entité. */
export class MandateBankExportNotFoundError extends ResourceNotFoundError {
  constructor(readonly exportId: string) {
    super(
      "accounting.mandate_bank_export.not_found",
      `Aucun export des mandats « ${exportId} » pour cette entité. Revenir à la fiche de l'entité et choisir l'export dans la liste.`,
    );
  }
}
