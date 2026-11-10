import {
  AccountBankExportClosedError,
  AccountBankExportNeverDownloadedError,
  AccountBankExportTooLargeError,
  DuplicateAccountInBankExportError,
  NoAccountToExportError,
} from "../errors/account-bank-export-errors.js";
import { BankLineNotInExportError } from "../errors/bank-report-errors.js";
import type { ExportedAccountLine } from "../ports/account-bank-exports.reader.js";
import { ACCOUNT_IMPORT_MAX_ROWS } from "../services/account-bank-export-values.js";
import {
  assertCorrectable,
  BANK_LINE_CORRECTIONS,
  rejectionReason,
  type BankLineCorrection,
} from "./bank-line-correction.js";
import type { ExportPart } from "../services/bank-export-reference.js";
import type { StaffStamp } from "./collection-batch.js";

/** Une ligne de l'export, et ce que le compte rendu CENET en a dit. */
/** Une ligne qui vient de recevoir sa correction. */
export type CorrectedAccountExportLine = AccountExportLine & {
  readonly correction: BankLineCorrection;
};

export interface AccountExportLine extends ExportedAccountLine {
  readonly correction: BankLineCorrection | null;
}

export interface AccountBankExportState {
  readonly id: string;
  /** `EXC-<n>` — attribué à la préparation, figé. */
  readonly reference: string;
  /** Le rang dans la série ; `null` pour un export d'avant la numérotation. */
  readonly part: ExportPart | null;
  /** L'entité depuis laquelle il est préparé — sa fiche porte la carte. */
  readonly legalEntityId: string;
  readonly created: StaffStamp;
  readonly lines: readonly AccountExportLine[];
  /** `null` tant que le fichier n'a jamais été téléchargé. */
  readonly lastDownloadedAt: Date | null;
  /** `null` tant que personne n'a dit « la banque l'a importé ». */
  readonly imported: StaffStamp | null;
  /** `null` tant que personne n'a dit « la banque l'a rejeté, on l'abandonne ». */
  readonly abandoned: StaffStamp | null;
}

export interface ExportAccountsInput {
  readonly id: string;
  readonly reference: string;
  readonly part: ExportPart;
  readonly legalEntityId: string;
  readonly created: StaffStamp;
  readonly lines: readonly ExportedAccountLine[];
}

/**
 * **Un export des comptes destinataires pour la banque** — les comptes figés
 * par l'empreinte de leur IBAN, jamais l'IBAN (doc `prerequis-export-ribs.md`
 * § 2.3).
 *
 * Les invariants, et rien d'autre ne les garde :
 *
 * - au moins un compte, **200 au plus** (réponse 8), et chaque empreinte **une
 *   seule fois** — un compte en double fait rejeter tout l'import ;
 * - un export se clôt **une fois**, importé OU abandonné : un export importé
 *   ne s'abandonne pas (ses comptes sont chez la banque, les renvoyer ferait
 *   tout rejeter), un export abandonné ne s'importe pas ;
 * - un export ne se marque importé qu'une fois son fichier **téléchargé** :
 *   la banque ne peut pas avoir importé un fichier que personne n'a tiré ;
 * - une ligne ne se corrige d'après le compte rendu CENET (« signalé connu »,
 *   « rejeté ») qu'une fois l'export DÉPOSÉ, une seule fois, dans la fenêtre
 *   du compte rendu (`bank-line-correction.ts`).
 */
export class AccountBankExport {
  private constructor(private state: AccountBankExportState) {}

  /**
   * @throws {NoAccountToExportError}
   * @throws {AccountBankExportTooLargeError}
   * @throws {DuplicateAccountInBankExportError}
   */
  static export(input: ExportAccountsInput): AccountBankExport {
    if (input.lines.length === 0) {
      throw new NoAccountToExportError();
    }
    if (input.lines.length > ACCOUNT_IMPORT_MAX_ROWS) {
      throw new AccountBankExportTooLargeError(input.lines.length, ACCOUNT_IMPORT_MAX_ROWS);
    }
    const seen = new Set<string>();
    for (const line of input.lines) {
      if (seen.has(line.accountFingerprint)) {
        throw new DuplicateAccountInBankExportError(line.bankAccountId);
      }
      seen.add(line.accountFingerprint);
    }
    return new AccountBankExport({
      ...input,
      lines: input.lines.map((line) => ({ ...line, correction: null })),
      lastDownloadedAt: null,
      imported: null,
      abandoned: null,
    });
  }

  static rehydrate(state: AccountBankExportState): AccountBankExport {
    return new AccountBankExport(state);
  }

  get id(): string {
    return this.state.id;
  }

  get reference(): string {
    return this.state.reference;
  }

  get accountCount(): number {
    return this.state.lines.length;
  }

  /**
   * @throws {AccountBankExportClosedError}
   * @throws {AccountBankExportNeverDownloadedError}
   */
  markImported(stamp: StaffStamp): void {
    this.assertOpen();
    if (this.state.lastDownloadedAt === null) {
      throw new AccountBankExportNeverDownloadedError();
    }
    this.state = { ...this.state, imported: stamp };
  }

  /** @throws {AccountBankExportClosedError} */
  abandon(stamp: StaffStamp): void {
    this.assertOpen();
    this.state = { ...this.state, abandoned: stamp };
  }

  /**
   * Un export abandonné ne se télécharge plus : ses comptes sont repartis
   * dans « à exporter », et un second fichier les porterait deux fois.
   *
   * @throws {AccountBankExportClosedError}
   */
  assertDownloadable(): void {
    if (this.state.abandoned !== null) {
      throw new AccountBankExportClosedError("abandoned", this.state.abandoned.at);
    }
  }

  /**
   * Le fichier vient d'être servi : l'instant se garde, pour que « marquer
   * importé » s'ouvre — rechargement de page compris.
   *
   * @throws {AccountBankExportClosedError}
   */
  recordDownload(at: Date): void {
    this.assertDownloadable();
    this.state = { ...this.state, lastDownloadedAt: at };
  }

  /**
   * Le compte rendu d'import dit que la banque avait déjà ce compte : il reste
   * tenu pour connu, avec la raison `reported_by_bank`.
   *
   * @throws {AccountBankExportClosedError} @throws {BankLineNotInExportError}
   * @throws {BankExportNotDepositedError} @throws {BankReportWindowClosedError}
   * @throws {BankLineAlreadyCorrectedError}
   */
  reportKnownByBank(bankAccountId: string, stamp: StaffStamp): CorrectedAccountExportLine {
    return this.correct(bankAccountId, stamp, {
      kind: BANK_LINE_CORRECTIONS.reportedByBank,
      stamp,
      rejectionReason: null,
    });
  }

  /**
   * Le compte rendu d'import met ce compte en erreur : il ne compte plus pour
   * connu, et redevient « à exporter » pour le prochain fichier.
   *
   * @throws {BankRejectionReasonError} et les refus de `reportKnownByBank`.
   */
  rejectAccount(
    bankAccountId: string,
    stamp: StaffStamp,
    reason: string,
  ): CorrectedAccountExportLine {
    const motive = rejectionReason(reason);
    return this.correct(bankAccountId, stamp, {
      kind: BANK_LINE_CORRECTIONS.rejected,
      stamp,
      rejectionReason: motive,
    });
  }

  toPersistence(): AccountBankExportState {
    return this.state;
  }

  private correct(
    bankAccountId: string,
    stamp: StaffStamp,
    correction: BankLineCorrection,
  ): CorrectedAccountExportLine {
    this.assertDownloadable();
    const line = this.state.lines.find((row) => row.bankAccountId === bankAccountId);
    if (line === undefined) {
      throw new BankLineNotInExportError("account", bankAccountId);
    }
    assertCorrectable("account", this.state.imported, line.correction, stamp.at);
    const corrected = { ...line, correction };
    this.state = {
      ...this.state,
      lines: this.state.lines.map((row) => (row === line ? corrected : row)),
    };
    return corrected;
  }

  private assertOpen(): void {
    if (this.state.imported !== null) {
      throw new AccountBankExportClosedError("imported", this.state.imported.at);
    }
    this.assertDownloadable();
  }
}
