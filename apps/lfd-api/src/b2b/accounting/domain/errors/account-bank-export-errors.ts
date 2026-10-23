import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus de l'**export des comptes destinataires** pour la banque (doc
 * `prerequis-export-ribs.md`). Lus par la comptabilité sans le code sous les
 * yeux : chacun nomme le cas et le geste de sortie. Aucun ne porte d'IBAN —
 * un compte se nomme par sa société et ses quatre derniers caractères.
 */

/** Rien à exporter : chaque compte est connu de la banque, en vol, ou écarté. */
export class NoAccountToExportError extends BusinessError {
  constructor() {
    super(
      "accounting.account_bank_export.nothing_to_export",
      "Aucun compte à exporter : chaque compte débité par un mandat actif est déjà importé à la banque, déclaré connu, dans un export pas encore importé, ou écarté (voir la liste). Un export en attente se marque importé, ou s'abandonne si la banque l'a rejeté.",
    );
  }
}

/** Un même compte deux fois dans un export : la banque rejetterait tout. */
export class DuplicateAccountInBankExportError extends DomainError {
  constructor(readonly bankAccountId: string) {
    super(
      "accounting.account_bank_export.duplicate_account",
      `Le compte ${bankAccountId} figure deux fois dans l'export : la banque rejette tout l'import quand un compte y est en double. Préparer l'export à nouveau.`,
    );
  }
}

/** Plus de comptes que la banque n'en importe en un fichier. */
export class AccountBankExportTooLargeError extends DomainError {
  constructor(
    readonly count: number,
    readonly maxRows: number,
  ) {
    super(
      "accounting.account_bank_export.too_many_accounts",
      `Un fichier des comptes destinataires porte ${String(maxRows)} comptes au plus, et celui-ci en porterait ${String(count)}. Préparer l'export à nouveau : il prend les ${String(maxRows)} premiers, les suivants partent dans l'export d'après.`,
    );
  }
}

/** L'export est déjà marqué importé, ou déjà abandonné. */
export class AccountBankExportClosedError extends BusinessError {
  constructor(
    readonly closedAs: "imported" | "abandoned",
    readonly at: Date,
  ) {
    super(
      `accounting.account_bank_export.already_${closedAs}`,
      closedAs === "imported"
        ? `Cet export est déjà marqué importé à la banque (le ${at.toISOString()}). Rien à refaire : ses comptes ne ressortiront plus.`
        : `Cet export a été abandonné (le ${at.toISOString()}) : ses comptes sont redevenus « à exporter ». Préparer un nouvel export.`,
    );
  }
}

/** Le fichier ne correspond plus : un RIB a changé, ou n'est plus débité. */
export class AccountBankExportOutdatedError extends BusinessError {
  constructor(readonly companyNames: readonly string[]) {
    super(
      "accounting.account_bank_export.outdated",
      `Le fichier de cet export ne correspond plus aux comptes de : ${companyNames.join(", ")} (RIB changé, ou plus aucun mandat actif dessus). L'abandonner, puis préparer un nouvel export — celui-ci ne se télécharge plus.`,
    );
  }
}

/** Un titulaire dépasse ce que la banque accepte en colonne B. */
export class AccountHolderTooLongError extends BusinessError {
  constructor(
    readonly companyNames: readonly string[],
    readonly maxLength: number,
  ) {
    super(
      "accounting.account_bank_export.holder_too_long",
      `Le titulaire du compte dépasse ${String(maxLength)} caractères, la limite de la banque, pour : ${companyNames.join(", ")}. Raccourcir le titulaire sur le RIB de la société, puis télécharger le fichier à nouveau.`,
    );
  }
}

/** Le compte est déjà connu, ou dans un export pas encore importé. */
export class AccountAlreadyKnownToBankError extends BusinessError {
  constructor(readonly companyName: string) {
    super(
      "accounting.account_bank_export.already_known",
      `Le compte de « ${companyName} » est déjà connu de la banque, ou dans un export pas encore importé. Rien à déclarer : s'il est dans un export que la banque a rejeté, abandonner cet export d'abord.`,
    );
  }
}

/** Une raison de « connu de la banque » qui n'est ni saisie CENET, ni signalement. */
export class UnknownKnownAccountReasonError extends DomainError {
  constructor(readonly reason: string) {
    super(
      "accounting.account_bank_export.unknown_known_reason",
      `« ${reason} » n'est pas une raison connue : un compte est soit saisi dans CENET, soit signalé comme connu par la banque. Choisir l'un des deux boutons.`,
    );
  }
}

/** L'export n'existe pas, ou pas pour cette entité. */
export class AccountBankExportNotFoundError extends ResourceNotFoundError {
  constructor(readonly exportId: string) {
    super(
      "accounting.account_bank_export.not_found",
      `Aucun export des comptes « ${exportId} » pour cette entité. Revenir à la fiche de l'entité et choisir l'export dans la liste.`,
    );
  }
}

/** Le compte n'est débité par aucun mandat actif de l'entité. */
export class AccountNotDebitedByEntityError extends ResourceNotFoundError {
  constructor(readonly bankAccountId: string) {
    super(
      "accounting.account_bank_export.account_not_debited",
      `Aucun compte « ${bankAccountId} » débité par un mandat actif de cette entité. Revenir à la fiche de l'entité : la liste des comptes à exporter a pu changer.`,
    );
  }
}
