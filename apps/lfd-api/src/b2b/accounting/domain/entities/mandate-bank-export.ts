import {
  BankExportAlreadyImportedError,
  MandateBankExportAbandonedError,
  MandateBankExportNeverDownloadedError,
  BankExportTooManyMandatesError,
  DuplicateMandateInBankExportError,
  NothingToExportToBankError,
} from "../errors/mandate-bank-export-errors.js";
import { BankLineNotInExportError } from "../errors/bank-report-errors.js";
import type { ExportedMandateLine } from "../ports/mandate-bank-exports.reader.js";
import { BANK_IMPORT_MAX_ROWS } from "../services/mandate-bank-export-csv.js";
import {
  assertCorrectable,
  BANK_LINE_CORRECTIONS,
  rejectionReason,
  type BankLineCorrection,
} from "./bank-line-correction.js";
import type { StaffStamp } from "./collection-batch.js";

/** Une ligne de l'export, et ce que le compte rendu CENET en a dit. */
/** Une ligne qui vient de recevoir sa correction. */
export type CorrectedMandateExportLine = MandateExportLine & {
  readonly correction: BankLineCorrection;
};

export interface MandateExportLine extends ExportedMandateLine {
  readonly correction: BankLineCorrection | null;
}

export interface MandateBankExportState {
  readonly id: string;
  readonly legalEntityId: string;
  readonly created: StaffStamp;
  readonly lines: readonly MandateExportLine[];
  /** `null` tant que le fichier n'a jamais été téléchargé. */
  readonly lastDownloadedAt: Date | null;
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
 * Les invariants, et rien d'autre ne les garde :
 *
 * - un export porte **au moins un** mandat, **200 au plus** (la banque n'en
 *   importe pas davantage par fichier), et chacun **une seule fois** ;
 * - un export se clôt **une fois**, importé OU abandonné : un téléchargement
 *   n'est pas un import, un second marquage effacerait qui l'a dit le premier,
 *   un export importé ne s'abandonne pas (ses mandats sont chez la banque) et
 *   un export abandonné ne s'importe ni ne se télécharge plus ;
 * - un export ne se marque importé qu'une fois son fichier **téléchargé** :
 *   la banque ne peut pas avoir importé un fichier que personne n'a tiré ;
 * - une ligne ne se corrige d'après le compte rendu CENET (« signalé connu »,
 *   « rejeté ») qu'une fois l'export DÉPOSÉ, une seule fois, dans la fenêtre
 *   du compte rendu (`bank-line-correction.ts`).
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
      lines: input.lines.map((line) => ({ ...line, correction: null })),
      lastDownloadedAt: null,
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
   * @throws {MandateBankExportNeverDownloadedError}
   */
  markImported(stamp: StaffStamp): void {
    this.assertOpen();
    if (this.state.lastDownloadedAt === null) {
      throw new MandateBankExportNeverDownloadedError();
    }
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

  /**
   * Le fichier vient d'être servi : l'instant se garde, pour que « marquer
   * importé » s'ouvre — rechargement de page compris.
   *
   * @throws {MandateBankExportAbandonedError}
   */
  recordDownload(at: Date): void {
    this.assertDownloadable();
    this.state = { ...this.state, lastDownloadedAt: at };
  }

  /**
   * Le compte rendu d'import dit que la banque avait déjà ce mandat : il
   * reste tenu pour importé, avec la raison `reported_by_bank`.
   *
   * @throws {MandateBankExportAbandonedError} @throws {BankLineNotInExportError}
   * @throws {BankExportNotDepositedError} @throws {BankReportWindowClosedError}
   * @throws {BankLineAlreadyCorrectedError}
   */
  reportKnownByBank(mandateId: string, stamp: StaffStamp): CorrectedMandateExportLine {
    return this.correct(mandateId, stamp, {
      kind: BANK_LINE_CORRECTIONS.reportedByBank,
      stamp,
      rejectionReason: null,
    });
  }

  /**
   * Le compte rendu d'import met ce mandat en erreur : il ne compte plus pour
   * importé, et redevient « à exporter » pour le prochain fichier.
   *
   * @throws {BankRejectionReasonError} et les refus de `reportKnownByBank`.
   */
  rejectMandate(mandateId: string, stamp: StaffStamp, reason: string): CorrectedMandateExportLine {
    const motive = rejectionReason(reason);
    return this.correct(mandateId, stamp, {
      kind: BANK_LINE_CORRECTIONS.rejected,
      stamp,
      rejectionReason: motive,
    });
  }

  toPersistence(): MandateBankExportState {
    return this.state;
  }

  private correct(
    mandateId: string,
    stamp: StaffStamp,
    correction: BankLineCorrection,
  ): CorrectedMandateExportLine {
    this.assertDownloadable();
    const line = this.state.lines.find((row) => row.mandateId === mandateId);
    if (line === undefined) {
      throw new BankLineNotInExportError("mandate", mandateId);
    }
    assertCorrectable("mandate", this.state.imported, line.correction, stamp.at);
    const corrected = { ...line, correction };
    this.state = {
      ...this.state,
      lines: this.state.lines.map((row) => (row === line ? corrected : row)),
    };
    return corrected;
  }

  private assertOpen(): void {
    if (this.state.imported !== null) {
      throw new BankExportAlreadyImportedError(this.state.imported.at);
    }
    this.assertDownloadable();
  }
}
