import {
  AccountBankExportClosedError,
  AccountBankExportTooLargeError,
  DuplicateAccountInBankExportError,
  NoAccountToExportError,
} from "../errors/account-bank-export-errors.js";
import type { ExportedAccountLine } from "../ports/account-bank-exports.reader.js";
import { ACCOUNT_IMPORT_MAX_ROWS } from "../services/account-bank-export-values.js";
import type { StaffStamp } from "./collection-batch.js";

export interface AccountBankExportState {
  readonly id: string;
  /** L'entité depuis laquelle il est préparé — sa fiche porte la carte. */
  readonly legalEntityId: string;
  readonly created: StaffStamp;
  readonly lines: readonly ExportedAccountLine[];
  /** `null` tant que personne n'a dit « la banque l'a importé ». */
  readonly imported: StaffStamp | null;
  /** `null` tant que personne n'a dit « la banque l'a rejeté, on l'abandonne ». */
  readonly abandoned: StaffStamp | null;
}

export interface ExportAccountsInput {
  readonly id: string;
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
 *   tout rejeter), un export abandonné ne s'importe pas.
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
      lines: [...input.lines],
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

  get accountCount(): number {
    return this.state.lines.length;
  }

  /** @throws {AccountBankExportClosedError} */
  markImported(stamp: StaffStamp): void {
    this.assertOpen();
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

  toPersistence(): AccountBankExportState {
    return this.state;
  }

  private assertOpen(): void {
    if (this.state.imported !== null) {
      throw new AccountBankExportClosedError("imported", this.state.imported.at);
    }
    this.assertDownloadable();
  }
}
