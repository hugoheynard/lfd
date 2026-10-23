import {
  BankExportAlreadyImportedError,
  MandateBankExportAbandonedError,
  BankExportTooManyMandatesError,
  DuplicateMandateInBankExportError,
  NothingToExportToBankError,
} from "../errors/mandate-bank-export-errors.js";
import type { ExportedMandateLine } from "../ports/mandate-bank-exports.reader.js";
import { BANK_IMPORT_MAX_ROWS } from "../services/mandate-bank-export-csv.js";
import type { StaffStamp } from "./collection-batch.js";

export interface MandateBankExportState {
  readonly id: string;
  readonly legalEntityId: string;
  readonly created: StaffStamp;
  readonly lines: readonly ExportedMandateLine[];
  /** `null` tant que personne n'a dit « la banque l'a importé ». */
  readonly imported: StaffStamp | null;
  /** `null` tant que personne n'a dit « la banque l'a rejeté, on l'abandonne ». */
  readonly abandoned: StaffStamp | null;
}

export interface ExportMandatesInput {
  readonly id: string;
  readonly legalEntityId: string;
  readonly created: StaffStamp;
  readonly lines: readonly ExportedMandateLine[];
}

/**
 * **Un export des mandats pour la banque** — les mandats d'une entité, figés
 * avec l'empreinte du compte sous lequel ils partent (plan
 * `export-des-mandats-pour-la-banque.md`).
 *
 * Deux invariants, et rien d'autre ne les garde :
 *
 * - un export porte **au moins un** mandat, **200 au plus** (la banque n'en
 *   importe pas davantage par fichier), et chacun **une seule fois** ;
 * - un export se clôt **une fois**, importé OU abandonné : un téléchargement
 *   n'est pas un import, un second marquage effacerait qui l'a dit le premier,
 *   un export importé ne s'abandonne pas (ses mandats sont chez la banque) et
 *   un export abandonné ne s'importe ni ne se télécharge plus.
 */
export class MandateBankExport {
  private constructor(private state: MandateBankExportState) {}

  /**
   * @throws {NothingToExportToBankError}
   * @throws {BankExportTooManyMandatesError}
   * @throws {DuplicateMandateInBankExportError}
   */
  static export(input: ExportMandatesInput): MandateBankExport {
    if (input.lines.length === 0) {
      throw new NothingToExportToBankError();
    }
    if (input.lines.length > BANK_IMPORT_MAX_ROWS) {
      throw new BankExportTooManyMandatesError(input.lines.length, BANK_IMPORT_MAX_ROWS);
    }
    const seen = new Set<string>();
    for (const line of input.lines) {
      if (seen.has(line.mandateId)) {
        throw new DuplicateMandateInBankExportError(line.rum);
      }
      seen.add(line.mandateId);
    }
    return new MandateBankExport({
      ...input,
      lines: [...input.lines],
      imported: null,
      abandoned: null,
    });
  }

  static rehydrate(state: MandateBankExportState): MandateBankExport {
    return new MandateBankExport(state);
  }

  get id(): string {
    return this.state.id;
  }

  get mandateCount(): number {
    return this.state.lines.length;
  }

  /**
   * @throws {BankExportAlreadyImportedError}
   * @throws {MandateBankExportAbandonedError}
   */
  markImported(stamp: StaffStamp): void {
    this.assertOpen();
    this.state = { ...this.state, imported: stamp };
  }

  /**
   * La banque a rejeté l'export (plan `plan-page-procedure-de-prelevement.md`,
   * S3) : il cesse d'être « en attente ». Ses mandats n'ont jamais compté
   * pour importés — ils restent « à exporter » sans autre geste.
   *
   * @throws {BankExportAlreadyImportedError}
   * @throws {MandateBankExportAbandonedError}
   */
  abandon(stamp: StaffStamp): void {
    this.assertOpen();
    this.state = { ...this.state, abandoned: stamp };
  }

  /**
   * Un export abandonné ne se télécharge plus : ses mandats partiront dans un
   * nouvel export, et deux fichiers les porteraient deux fois.
   *
   * @throws {MandateBankExportAbandonedError}
   */
  assertDownloadable(): void {
    if (this.state.abandoned !== null) {
      throw new MandateBankExportAbandonedError(this.state.abandoned.at);
    }
  }

  toPersistence(): MandateBankExportState {
    return this.state;
  }

  private assertOpen(): void {
    if (this.state.imported !== null) {
      throw new BankExportAlreadyImportedError(this.state.imported.at);
    }
    this.assertDownloadable();
  }
}
