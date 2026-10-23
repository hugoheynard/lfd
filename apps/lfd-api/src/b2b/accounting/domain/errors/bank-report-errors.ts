import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus des **corrections tirées du compte rendu d'import CENET** (doc
 * `prerequis-export-ribs.md` § 2.6, `prerequis-export-mandats.md`, Hugo
 * 2026-10-23) — communs aux deux exports, chacun nommant ce qu'il porte
 * (« compte » ou « mandat »). Lus par la comptabilité sans le code.
 */
export type BankReportSubject = "account" | "mandate";

const WORDS: Readonly<Record<BankReportSubject, { readonly line: string; readonly file: string }>> =
  {
    account: { line: "Ce compte", file: "le fichier des comptes" },
    mandate: { line: "Ce mandat", file: "le fichier des mandats" },
  };

/** L'export n'est pas encore déposé (marqué importé) : il n'a pas de compte rendu. */
export class BankExportNotDepositedError extends BusinessError {
  constructor(readonly subject: BankReportSubject) {
    super(
      `accounting.bank_report.${subject}_not_deposited`,
      `Disponible après le dépôt dans CENET : ${WORDS[subject].file} de cet export n'a pas encore été dit déposé, il n'a donc pas de compte rendu d'import. Déposer le fichier dans CENET, cliquer « J'ai déposé le fichier dans CENET », puis reporter ce que dit le compte rendu.`,
    );
  }
}

/** La ligne a déjà reçu une correction : la première fait foi. */
export class BankLineAlreadyCorrectedError extends BusinessError {
  constructor(
    readonly subject: BankReportSubject,
    readonly correctedAt: Date,
  ) {
    super(
      `accounting.bank_report.${subject}_already_corrected`,
      `${WORDS[subject].line} a déjà été corrigé d'après le compte rendu CENET (le ${correctedAt.toISOString()}) : la première correction fait foi. S'il faut la reprendre, le renvoyer dans un prochain export.`,
    );
  }
}

/** Le compte rendu est trop ancien : la fenêtre de correction est close. */
export class BankReportWindowClosedError extends BusinessError {
  constructor(
    readonly subject: BankReportSubject,
    readonly closedAt: Date,
  ) {
    super(
      `accounting.bank_report.${subject}_window_closed`,
      `Le compte rendu d'import de cet export ne se reporte plus depuis le ${closedAt.toISOString()} : la correction se fait dans les jours qui suivent le dépôt. ${WORDS[subject].line} reste tel qu'il est ; s'il faut le renvoyer à la banque, utiliser le geste de sa ligne dans un nouvel export.`,
    );
  }
}

/** La ligne n'est pas dans cet export. */
export class BankLineNotInExportError extends ResourceNotFoundError {
  constructor(
    readonly subject: BankReportSubject,
    readonly lineId: string,
  ) {
    super(
      `accounting.bank_report.${subject}_not_in_export`,
      `« ${lineId} » n'est pas dans cet export. Revenir à la fiche de l'entité : la liste a pu changer.`,
    );
  }
}

/** Un rejet sans motif, ou un motif trop long. */
export class BankRejectionReasonError extends DomainError {
  constructor(readonly maxLength: number) {
    super(
      "accounting.bank_report.rejection_reason",
      `Le motif du rejet est obligatoire, en ${String(maxLength)} caractères au plus : recopier la raison que donne le compte rendu d'import CENET.`,
    );
  }
}
