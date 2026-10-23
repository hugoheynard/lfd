import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { AccountBankExport } from "../../../domain/entities/account-bank-export.js";
import type { KnownBankAccount } from "../../../domain/entities/known-bank-account.js";
import {
  AccountBankExportRepository,
  KnownBankAccountRepository,
} from "../../../domain/ports/account-bank-export.repository.js";
import {
  AccountBankExportsReader,
  KnownAccountFingerprintsReader,
  KnownAccountStampsReader,
  type KnownAccountStamp,
  type AccountBankExportFile,
  type AccountBankExportRecord,
  type KnownAccountFingerprints,
} from "../../../domain/ports/account-bank-exports.reader.js";
import {
  AccountsForBankExportReader,
  type AccountExcludedFromBankExport,
  type AccountForBankExport,
  type AccountsForBankExport,
} from "../../../domain/ports/accounts-for-bank-export.reader.js";
import { AbandonAccountBankExportHandler } from "../abandon-account-bank-export.handler.js";
import { DeclareBankAccountKnownHandler } from "../declare-bank-account-known.handler.js";
import { ExportAccountsForBankHandler } from "../export-accounts-for-bank.handler.js";
import { MarkAccountBankExportImportedHandler } from "../mark-account-bank-export-imported.handler.js";
import { RecordAccountBankExportDownloadHandler } from "../record-account-bank-export-download.handler.js";
import { UlidSequence } from "./collection-doubles.js";
import { OneEntity, entityRecord } from "./mandate-bank-export-doubles.js";

/**
 * Les doublés de l'export des comptes : la mémoire des exports et des
 * déclarations sert le port d'écriture ET les lecteurs, comme la base — et
 * « déjà connu » s'y lit sur TOUTES les entités, comme en base (R7).
 */

/** Comparé à rien d'autre qu'aux tampons qu'il pose : l'horloge est fixe. */
export const NOW = new Date("2026-10-23T09:00:00.000Z");

export class FakeDebitedAccounts extends AccountsForBankExportReader {
  exportable: AccountForBankExport[] = [];
  excluded: AccountExcludedFromBankExport[] = [];
  readonly asked: string[] = [];
  debitedBy(creditorId: string): Promise<AccountsForBankExport> {
    this.asked.push(creditorId);
    return Promise.resolve({ exportable: this.exportable, excluded: this.excluded });
  }
}

export class MemoryAccountExports extends AccountBankExportRepository {
  readonly rows = new Map<string, AccountBankExport>();
  load(legalEntityId: string, exportId: string): Promise<AccountBankExport | null> {
    const found = this.rows.get(exportId);
    return Promise.resolve(found?.toPersistence().legalEntityId === legalEntityId ? found : null);
  }
  save(bankExport: AccountBankExport): Promise<void> {
    this.rows.set(bankExport.id, AccountBankExport.rehydrate(bankExport.toPersistence()));
    return Promise.resolve();
  }
}

export class MemoryKnownAccounts extends KnownBankAccountRepository {
  readonly rows: KnownBankAccount[] = [];
  add(account: KnownBankAccount): Promise<void> {
    this.rows.push(account);
    return Promise.resolve();
  }
}

/** Ce que la base rend : lignes non abandonnées, importées ou en vol, et déclarations. */
export class MemoryFingerprints extends KnownAccountFingerprintsReader {
  constructor(
    private readonly exports: MemoryAccountExports,
    private readonly declared: MemoryKnownAccounts,
  ) {
    super();
  }
  all(): Promise<KnownAccountFingerprints> {
    const known = new Set(this.declared.rows.map((row) => row.toPersistence().accountFingerprint));
    const inFlight = new Set<string>();
    for (const row of this.exports.rows.values()) {
      const state = row.toPersistence();
      if (state.abandoned !== null) {
        continue;
      }
      for (const line of state.lines) {
        (state.imported === null ? inFlight : known).add(line.accountFingerprint);
      }
    }
    return Promise.resolve({ known, inFlight });
  }
}

export class MemoryAccountExportsReader extends AccountBankExportsReader {
  constructor(private readonly exports: MemoryAccountExports) {
    super();
  }
  list(legalEntityId: string): Promise<readonly AccountBankExportRecord[]> {
    return Promise.resolve(
      [...this.exports.rows.values()]
        .map((row) => row.toPersistence())
        .filter((state) => state.legalEntityId === legalEntityId)
        .map((state) => ({
          id: state.id,
          createdAt: state.created.at,
          accountCount: state.lines.length,
          importedAt: state.imported?.at ?? null,
          abandonedAt: state.abandoned?.at ?? null,
        })),
    );
  }
  async fileOf(legalEntityId: string, exportId: string): Promise<AccountBankExportFile | null> {
    const found = await this.exports.load(legalEntityId, exportId);
    if (found === null) {
      return null;
    }
    const state = found.toPersistence();
    return { lines: state.lines, abandonedAt: state.abandoned?.at ?? null };
  }
}

/** Les tampons, lus des mêmes doublés que les empreintes : le plus ancien gagne. */
export class MemoryStamps extends KnownAccountStampsReader {
  constructor(
    private readonly exports: MemoryAccountExports,
    private readonly declared: MemoryKnownAccounts,
  ) {
    super();
  }
  stampsOf(fingerprints: readonly string[]): Promise<ReadonlyMap<string, KnownAccountStamp>> {
    const wanted = new Set(fingerprints);
    const all: [string, KnownAccountStamp][] = [
      ...[...this.exports.rows.values()].flatMap((row) => {
        const state = row.toPersistence();
        const imported = state.abandoned === null ? state.imported : null;
        return imported === null
          ? []
          : state.lines.map((line): [string, KnownAccountStamp] => [
              line.accountFingerprint,
              { kind: "imported", at: imported.at },
            ]);
      }),
      ...this.declared.rows.map((row): [string, KnownAccountStamp] => {
        const state = row.toPersistence();
        return [
          state.accountFingerprint,
          { kind: "declared", reason: state.reason, at: state.declared.at },
        ];
      }),
    ];
    const stamps = new Map<string, KnownAccountStamp>();
    for (const [fingerprint, stamp] of all) {
      const held = stamps.get(fingerprint);
      if (wanted.has(fingerprint) && (held === undefined || stamp.at < held.at)) {
        stamps.set(fingerprint, stamp);
      }
    }
    return Promise.resolve(stamps);
  }
}

/** Les cinq commandes branchées sur les mêmes doublés. */
export function accountExportWorld() {
  const exports = new MemoryAccountExports();
  const declared = new MemoryKnownAccounts();
  const w = {
    entities: new OneEntity(entityRecord()),
    accounts: new FakeDebitedAccounts(),
    exports,
    declared,
    fingerprints: new MemoryFingerprints(exports, declared),
    reader: new MemoryAccountExportsReader(exports),
    stamps: new MemoryStamps(exports, declared),
    events: new RecordingPublisher(),
    clock: new FixedClock(NOW),
  };
  const uow = new DirectUnitOfWork();
  const gesture = { entities: w.entities, exports, clock: w.clock, events: w.events, uow };
  const handlers = {
    prepare: new ExportAccountsForBankHandler(
      w.entities,
      w.accounts,
      w.fingerprints,
      exports,
      new UlidSequence(),
      w.clock,
      w.events,
      uow,
    ),
    markImported: new MarkAccountBankExportImportedHandler(
      gesture.entities,
      gesture.exports,
      gesture.clock,
      gesture.events,
      gesture.uow,
    ),
    abandon: new AbandonAccountBankExportHandler(
      gesture.entities,
      gesture.exports,
      gesture.clock,
      gesture.events,
      gesture.uow,
    ),
    download: new RecordAccountBankExportDownloadHandler(
      gesture.entities,
      gesture.exports,
      gesture.clock,
      gesture.events,
      gesture.uow,
    ),
    declareKnown: new DeclareBankAccountKnownHandler(
      w.entities,
      w.accounts,
      w.fingerprints,
      declared,
      new UlidSequence(),
      w.clock,
      w.events,
      uow,
    ),
  };
  return { ...w, ...handlers };
}
