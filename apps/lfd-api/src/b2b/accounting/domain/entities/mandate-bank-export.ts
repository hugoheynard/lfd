import {
  BankExportAlreadyImportedError,
  DuplicateMandateInBankExportError,
  NothingToExportToBankError,
} from "../errors/mandate-bank-export-errors.js";
import type { ExportedMandateLine } from "../ports/mandate-bank-exports.reader.js";
import type { StaffStamp } from "./collection-batch.js";

export interface MandateBankExportState {
  readonly id: string;
  readonly legalEntityId: string;
  readonly created: StaffStamp;
  readonly lines: readonly ExportedMandateLine[];
  /** `null` tant que personne n'a dit « la banque l'a importé ». */
  readonly imported: StaffStamp | null;
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
 * `plan-export-des-mandats-pour-la-banque.md`, § 2 bis-1 et 4).
 *
 * Deux invariants, et rien d'autre ne les garde :
 *
 * - un export porte **au moins un** mandat, et chacun **une seule fois** ;
 * - « importé » se marque **une fois** : un téléchargement n'est pas un import,
 *   et un second marquage effacerait qui l'a dit le premier.
 */
export class MandateBankExport {
  private constructor(private state: MandateBankExportState) {}

  /** @throws {NothingToExportToBankError} @throws {DuplicateMandateInBankExportError} */
  static export(input: ExportMandatesInput): MandateBankExport {
    if (input.lines.length === 0) {
      throw new NothingToExportToBankError();
    }
    const seen = new Set<string>();
    for (const line of input.lines) {
      if (seen.has(line.mandateId)) {
        throw new DuplicateMandateInBankExportError(line.rum);
      }
      seen.add(line.mandateId);
    }
    return new MandateBankExport({ ...input, lines: [...input.lines], imported: null });
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

  /** @throws {BankExportAlreadyImportedError} */
  markImported(stamp: StaffStamp): void {
    if (this.state.imported !== null) {
      throw new BankExportAlreadyImportedError(this.state.imported.at);
    }
    this.state = { ...this.state, imported: stamp };
  }

  toPersistence(): MandateBankExportState {
    return this.state;
  }
}
