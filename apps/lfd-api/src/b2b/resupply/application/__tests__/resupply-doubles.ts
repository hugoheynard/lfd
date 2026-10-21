import {
  StaffDirectory,
  type StaffIdentity,
} from "../../../account/domain/ports/staff-directory.js";
import { type ResupplyArticle, ResupplyCatalogue } from "../../domain/resupply-catalogue.js";
import { ResupplyReceipt } from "../../domain/resupply-receipt.js";
import { ResupplyReceiptRepository } from "../../domain/resupply-receipt.repository.js";
import { ResupplySites } from "../../domain/resupply-sites.js";

/** Les réceptions en mémoire : `save` garde l'état, `load` le réhydrate comme la base. */
export class InMemoryReceipts extends ResupplyReceiptRepository {
  readonly saved: ResupplyReceipt[] = [];

  load(siteId: string, serviceDay: string): Promise<ResupplyReceipt | null> {
    const last = [...this.saved]
      .reverse()
      .find((receipt) => receipt.siteId === siteId && receipt.serviceDay === serviceDay);
    if (last === undefined) {
      return Promise.resolve(null);
    }
    return Promise.resolve(
      ResupplyReceipt.restore({
        id: last.id,
        siteId: last.siteId,
        serviceDay: last.serviceDay,
        version: last.version + 1,
        lines: last.lines,
        lastChange: last.lastChange,
      }),
    );
  }

  save(receipt: ResupplyReceipt): Promise<void> {
    this.saved.push(receipt);
    return Promise.resolve();
  }
}

export class Catalogue extends ResupplyCatalogue {
  constructor(private readonly known: readonly ResupplyArticle[]) {
    super();
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
