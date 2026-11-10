import {
  StaffDirectory,
  type StaffIdentity,
} from "../../../account/domain/ports/staff-directory.js";
import { type ResupplyArticle, ResupplyCatalogue } from "../../domain/resupply-catalogue.js";
import { ResupplyReceipt, type ResupplyReceiptSnapshot } from "../../domain/resupply-receipt.js";
import {
  ResupplyAlreadyReceivedError,
  ResupplyReceiptChangedMeanwhileError,
} from "../../domain/resupply-receipt-errors.js";
import { ResupplyReceiptReader } from "../../domain/resupply-receipt.reader.js";
import { ResupplyReceiptRepository } from "../../domain/resupply-receipt.repository.js";
import { ResupplyReceptions } from "../../domain/resupply-receptions.js";
import { ResupplySites } from "../../domain/resupply-sites.js";
import type { ResupplyTrace } from "../../domain/resupply-trace.js";

/** L'instantané d'un reçu, tel que la base le rendrait. */
function snapshotOf(receipt: ResupplyReceipt, version: number): ResupplyReceiptSnapshot {
  return {
    id: receipt.id,
    siteId: receipt.siteId,
    serviceDay: receipt.serviceDay,
    resupplyId: receipt.resupplyId,
    version,
    lines: receipt.lines,
    received: receipt.received,
    lastChange: receipt.lastChange,
  };
}

/**
 * Les reçus en mémoire : `save` garde le dernier état, les `load*` le
 * réhydratent sous le point demandé, comme le `where` de la base. Il tient
 * les refus de la base : le verrou de version, un reçu par réassort.
 */
export class InMemoryReceipts extends ResupplyReceiptRepository {
  private readonly rows = new Map<string, ResupplyReceiptSnapshot>();
  saves = 0;

  loadUnordered(siteId: string, serviceDay: string): Promise<ResupplyReceipt | null> {
    return this.restored(
      (row) => row.siteId === siteId && row.serviceDay === serviceDay && row.resupplyId === null,
    );
  }

  loadForResupply(siteId: string, resupplyId: string): Promise<ResupplyReceipt | null> {
    return this.restored((row) => row.siteId === siteId && row.resupplyId === resupplyId);
  }

  /** Un geste d'un autre poste, joué juste avant la prochaine écriture ; consommé à l'usage. */
  beforeNextSave: (() => Promise<unknown>) | null = null;

  async save(receipt: ResupplyReceipt): Promise<void> {
    const racer = this.beforeNextSave;
    this.beforeNextSave = null;
    if (racer !== null) {
      await racer();
    }
    return this.write(receipt);
  }

  private write(receipt: ResupplyReceipt): Promise<void> {
    if (receipt.version === 0) {
      if (
        receipt.resupplyId !== null &&
        this.all().some((row) => row.resupplyId === receipt.resupplyId)
      ) {
        return Promise.reject(new ResupplyAlreadyReceivedError("un autre poste", "à l'instant"));
      }
    } else if (this.rows.get(receipt.id)?.version !== receipt.version) {
      return Promise.reject(new ResupplyReceiptChangedMeanwhileError());
    }
    this.saves += 1;
    this.rows.set(receipt.id, snapshotOf(receipt, receipt.version + 1));
    return Promise.resolve();
  }

  all(): readonly ResupplyReceiptSnapshot[] {
    return [...this.rows.values()];
  }

  private restored(
    match: (row: ResupplyReceiptSnapshot) => boolean,
  ): Promise<ResupplyReceipt | null> {
    const row = this.all().find(match);
    return Promise.resolve(row === undefined ? null : ResupplyReceipt.restore(row));
  }
}

/** Le lecteur sur le même stockage. */
export class InMemoryReceiptReader extends ResupplyReceiptReader {
  constructor(private readonly store: InMemoryReceipts) {
    super();
  }

  on(siteId: string, serviceDay: string): Promise<readonly ResupplyReceiptSnapshot[]> {
    return Promise.resolve(
      this.store.all().filter((row) => row.siteId === siteId && row.serviceDay === serviceDay),
    );
  }
}

/** La réception d'un réassort, lue sur le même stockage que les reçus. */
export class InMemoryReceptions extends ResupplyReceptions {
  constructor(private readonly store: InMemoryReceipts) {
    super();
  }

  receptionOf(siteId: string, resupplyId: string): Promise<ResupplyTrace | null> {
    const row = this.store
      .all()
      .find((candidate) => candidate.siteId === siteId && candidate.resupplyId === resupplyId);
    return Promise.resolve(row?.received ?? null);
  }
}

export class Catalogue extends ResupplyCatalogue {
  private known: readonly ResupplyArticle[];

  constructor(known: readonly ResupplyArticle[]) {
    super();
    this.known = known;
  }

  /** L'article retiré du catalogue publié (masqué au référentiel) ; rend le catalogue d'avant. */
  withdraw(sku: string): () => void {
    const before = this.known;
    this.known = before.filter((article) => article.sku !== sku);
    return () => {
      this.known = before;
    };
  }
  articles(): Promise<readonly ResupplyArticle[]> {
    return Promise.resolve(this.known);
  }
  article(sku: string): Promise<ResupplyArticle | null> {
    return Promise.resolve(this.known.find((article) => article.sku === sku) ?? null);
  }
}

export class Sites extends ResupplySites {
  constructor(private readonly known: readonly string[]) {
    super();
  }
  exists(siteId: string): Promise<boolean> {
    return Promise.resolve(this.known.includes(siteId));
  }
}

export class Directory extends StaffDirectory {
  constructor(private readonly identity: StaffIdentity | null) {
    super();
  }
  identify(): Promise<StaffIdentity | null> {
    return Promise.resolve(this.identity);
  }
}
