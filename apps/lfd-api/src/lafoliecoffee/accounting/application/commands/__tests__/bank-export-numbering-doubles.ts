import {
  BankExportPreparationLock,
  type BankExportKind,
} from "../../../domain/ports/bank-export-preparation-lock.js";
import {
  AccountBankExportNumbering,
  MandateBankExportNumbering,
} from "../../../domain/ports/bank-export-numbering.js";
import type { PreviousExportPart } from "../../../domain/services/bank-export-reference.js";
import type { ExportPart } from "../../../domain/services/bank-export-reference.js";

/** Ce que le doublé lit d'un export rangé en mémoire. */
interface StoredExport {
  readonly toPersistence: () => {
    readonly legalEntityId: string;
    readonly id: string;
    readonly created: { readonly at: Date };
    readonly abandoned: unknown;
    readonly part: ExportPart | null;
  };
}

/** Le dernier export non abandonné de l'entité — l'ordre de l'adaptateur Prisma. */
function lastPartIn(
  rows: Iterable<StoredExport>,
  legalEntityId: string,
): PreviousExportPart | null {
  const states = [...rows]
    .map((row) => row.toPersistence())
    .filter((state) => state.legalEntityId === legalEntityId && state.abandoned === null)
    .sort(
      (a, b) =>
        b.created.at.getTime() - a.created.at.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
    );
  const last = states[0];
  return last === undefined ? null : { part: last.part };
}

/** Le compteur global en mémoire : il ne repart jamais à zéro. */
export class MemoryAccountNumbering extends AccountBankExportNumbering {
  lastRank = 0;
  constructor(private readonly rows: { readonly rows: ReadonlyMap<string, StoredExport> }) {
    super();
  }
  nextRank(): Promise<number> {
    this.lastRank += 1;
    return Promise.resolve(this.lastRank);
  }
  lastPart(legalEntityId: string): Promise<PreviousExportPart | null> {
    return Promise.resolve(lastPartIn(this.rows.rows.values(), legalEntityId));
  }
}

export class MemoryMandateNumbering extends MandateBankExportNumbering {
  lastRank = 0;
  constructor(private readonly rows: { readonly rows: ReadonlyMap<string, StoredExport> }) {
    super();
  }
  nextRank(): Promise<number> {
    this.lastRank += 1;
    return Promise.resolve(this.lastRank);
  }
  lastPart(legalEntityId: string): Promise<PreviousExportPart | null> {
    return Promise.resolve(lastPartIn(this.rows.rows.values(), legalEntityId));
  }
}

/**
 * Le verrou de préparation en mémoire : il note chaque prise, et ce que le
 * monde montrait à cet instant (`seen`) — de quoi prouver qu'il passe AVANT
 * la lecture des candidats et le numéro.
 */
export class RecordingPreparationLock extends BankExportPreparationLock {
  readonly acquired: {
    readonly legalEntityId: string;
    readonly kind: BankExportKind;
    readonly seen: string;
  }[] = [];
  observe: () => string = () => "";
  acquire(legalEntityId: string, kind: BankExportKind): Promise<void> {
    this.acquired.push({ legalEntityId, kind, seen: this.observe() });
    return Promise.resolve();
  }
}
