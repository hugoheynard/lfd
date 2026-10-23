import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { MemoryMandateNumbering } from "./bank-export-numbering-doubles.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { MandateBankExport } from "../../../domain/entities/mandate-bank-export.js";
import {
  LegalEntityReader,
  type LegalEntityRecord,
} from "../../../domain/ports/legal-entity.reader.js";
import { MandateBankExportRepository } from "../../../domain/ports/mandate-bank-export.repository.js";
import {
  ImportedMandateAccountsReader,
  MandateBankExportsReader,
  type ExportedMandateLine,
  type MandateBankExportFile,
  type MandateBankExportRecord,
  MandateBankLinesReader,
  type MandateBankLineStanding,
} from "../../../domain/ports/mandate-bank-exports.reader.js";
import {
  MandatesForBankExportReader,
  type MandateExcludedFromBankExport,
  type MandateForBankExport,
  type MandatesForBankExport,
} from "../../../domain/ports/mandates-for-bank-export.reader.js";
import { CreditorIdentifier } from "../../../domain/value-objects/creditor-identifier.js";
import { toView } from "../../../infrastructure/legal-entity.mapper.js";
import { AbandonMandateBankExportHandler } from "../abandon-mandate-bank-export.handler.js";
import { ExportMandatesForBankHandler } from "../export-mandates-for-bank.handler.js";
import { MarkMandateBankExportImportedHandler } from "../mark-mandate-bank-export-imported.handler.js";
import { RecordMandateBankExportDownloadHandler } from "../record-mandate-bank-export-download.handler.js";
import { RejectMandateAtBankHandler } from "../reject-mandate-at-bank.handler.js";
import { ReportMandateKnownToBankHandler } from "../report-mandate-known-to-bank.handler.js";
import { FakeCandidates, Steps, UlidSequence } from "./collection-doubles.js";
import { declaredEntity } from "./mandate-setting-doubles.js";

/**
 * Les doublés de l'export des mandats pour la banque : la mémoire des exports
 * sert à la fois le port d'écriture et les deux lecteurs, comme la base.
 */

/** Comparé à rien d'autre qu'aux tampons qu'il pose : l'horloge est fixe. */
export const NOW = new Date("2026-10-09T09:00:00.000Z");
export const ICS = "FR72ZZZ123456";
export const IBAN_A = "FR7630004000031234567890143";
export const IBAN_B = "FR1420041010050500013M02606";

/** L'entité `le1`, avec son ICS — par le vrai mapper, pas une vue écrite à la main. */
export function entityRecord(withIcs = true): LegalEntityRecord {
  const entity = declaredEntity();
  if (withIcs) {
    entity.assignCreditorIdentifier(CreditorIdentifier.create(ICS));
  }
  return toView(entity, true);
}

export class OneEntity extends LegalEntityReader {
  constructor(public record: LegalEntityRecord) {
    super();
  }
  list(): Promise<readonly LegalEntityRecord[]> {
    return Promise.resolve([this.record]);
  }
  byId(id: string): Promise<LegalEntityRecord | null> {
    return Promise.resolve(id === this.record.id ? this.record : null);
  }
}

export class FakeBankMandates extends MandatesForBankExportReader {
  exportable: MandateForBankExport[] = [];
  excluded: MandateExcludedFromBankExport[] = [];
  readonly asked: string[] = [];
  activeOf(creditorId: string): Promise<MandatesForBankExport> {
    this.asked.push(creditorId);
    return Promise.resolve({ exportable: this.exportable, excluded: this.excluded });
  }
}

export function bankMandate(id: string, iban = IBAN_A): MandateForBankExport {
  return {
    mandateId: id,
    reference: `RUM-${id}`,
    debtorCompanyId: `cmp_${id}`,
    iban,
    bic: "BNPAFRPP",
    signedAt: new Date("2026-09-14T22:00:00.000Z"),
    scheme: "B2B",
    paymentType: "recurrent",
  };
}

/** Les exports, en mémoire, avec leur entité : le mur rejoue le `where`. */
export class MemoryExports extends MandateBankExportRepository {
  readonly rows = new Map<string, MandateBankExport>();
  load(legalEntityId: string, exportId: string): Promise<MandateBankExport | null> {
    const found = this.rows.get(exportId);
    return Promise.resolve(found?.toPersistence().legalEntityId === legalEntityId ? found : null);
  }
  save(bankExport: MandateBankExport): Promise<void> {
    this.rows.set(bankExport.id, MandateBankExport.rehydrate(bankExport.toPersistence()));
    return Promise.resolve();
  }
}

export class MemoryImported extends ImportedMandateAccountsReader {
  constructor(private readonly exports: MemoryExports) {
    super();
  }
  of(legalEntityId: string): Promise<readonly ExportedMandateLine[]> {
    return Promise.resolve(
      [...this.exports.rows.values()]
        .map((row) => row.toPersistence())
        .filter((state) => state.legalEntityId === legalEntityId && state.imported !== null)
        .flatMap((state) => state.lines.filter((line) => line.correction?.kind !== "rejected")),
    );
  }
}

export class MemoryExportsReader extends MandateBankExportsReader {
  constructor(private readonly exports: MemoryExports) {
    super();
  }
  list(legalEntityId: string): Promise<readonly MandateBankExportRecord[]> {
    return Promise.resolve(
      [...this.exports.rows.values()]
        .map((row) => row.toPersistence())
        .filter((state) => state.legalEntityId === legalEntityId)
        .map((state) => ({
          id: state.id,
          reference: state.reference,
          part: state.part,
          createdAt: state.created.at,
          mandateCount: state.lines.length,
          lastDownloadedAt: state.lastDownloadedAt,
          importedAt: state.imported?.at ?? null,
          abandonedAt: state.abandoned?.at ?? null,
        })),
    );
  }
  async fileOf(legalEntityId: string, exportId: string): Promise<MandateBankExportFile | null> {
    const found = await this.exports.load(legalEntityId, exportId);
    if (found === null) {
      return null;
    }
    const state = found.toPersistence();
    return {
      lines: state.lines,
      abandonedAt: state.abandoned?.at ?? null,
      reference: state.reference,
      part: state.part,
      createdAt: state.created.at,
      mandateCount: state.lines.length,
    };
  }
}

/** Les lignes des exports non abandonnés, lues des mêmes doublés. */
export class MemoryLines extends MandateBankLinesReader {
  constructor(private readonly exports: MemoryExports) {
    super();
  }
  linesOf(legalEntityId: string): Promise<readonly MandateBankLineStanding[]> {
    return Promise.resolve(
      [...this.exports.rows.values()]
        .map((row) => row.toPersistence())
        .filter((state) => state.legalEntityId === legalEntityId && state.abandoned === null)
        .flatMap((state) =>
          state.lines.map((line) => ({
            mandateId: line.mandateId,
            accountFingerprint: line.accountFingerprint,
            exportId: state.id,
            lastDownloadedAt: state.lastDownloadedAt,
            importedAt: state.imported?.at ?? null,
            correctedAs: line.correction?.kind ?? null,
            correctedAt: line.correction?.stamp.at ?? null,
          })),
        ),
    );
  }
}

/** Les commandes branchées sur les mêmes doublés. */
export function bankExportWorld() {
  const exports = new MemoryExports();
  const w = {
    entities: new OneEntity(entityRecord()),
    mandates: new FakeBankMandates(),
    exports,
    imported: new MemoryImported(exports),
    reader: new MemoryExportsReader(exports),
    lines: new MemoryLines(exports),
    candidates: new FakeCandidates(new Steps()),
    events: new RecordingPublisher(),
    clock: new FixedClock(NOW),
  };
  const exportCommand = new ExportMandatesForBankHandler(
    w.entities,
    w.mandates,
    w.imported,
    w.exports,
    new MemoryMandateNumbering(w.exports),
    new UlidSequence(),
    w.clock,
    w.events,
    new DirectUnitOfWork(),
  );
  const markImported = new MarkMandateBankExportImportedHandler(
    w.entities,
    w.exports,
    w.clock,
    w.events,
    new DirectUnitOfWork(),
  );
  const abandon = new AbandonMandateBankExportHandler(
    w.entities,
    w.exports,
    w.clock,
    w.events,
    new DirectUnitOfWork(),
  );
  const recordDownload = new RecordMandateBankExportDownloadHandler(
    w.entities,
    w.exports,
    w.clock,
    w.events,
    new DirectUnitOfWork(),
  );
  const gesture = [w.entities, w.exports, w.clock, w.events, new DirectUnitOfWork()] as const;
  const reportKnown = new ReportMandateKnownToBankHandler(...gesture);
  const reject = new RejectMandateAtBankHandler(...gesture);
  return { ...w, exportCommand, markImported, abandon, recordDownload, reportKnown, reject };
}
