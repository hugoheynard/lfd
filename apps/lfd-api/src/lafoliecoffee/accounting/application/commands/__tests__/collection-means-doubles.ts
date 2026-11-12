import type { NamedPayer } from "../../../domain/entities/payer-billing-mode-history.js";
import { PayerCollectionMeansHistory } from "../../../domain/entities/payer-collection-means-history.js";
import { PayerCollectionMeansReader } from "../../../domain/ports/payer-collection-means.reader.js";
import { PayerCollectionMeansRepository } from "../../../domain/ports/payer-collection-means.repository.js";
import {
  LegalEntityReader,
  type LegalEntityRecord,
} from "../../../domain/ports/legal-entity.reader.js";
import { PendingBankReturnsReader } from "../../../domain/ports/pending-bank-returns.reader.js";
import type { PayerMeansEntry } from "../../../domain/services/collection-means-timeline.js";
import { toView } from "../../../infrastructure/legal-entity.mapper.js";
import { declaredEntity } from "./mandate-setting-doubles.js";

/**
 * Doublés du moyen d'encaissement (T1). Le dépôt et le lecteur partagent UN
 * magasin, comme la table ; `save` n'écrit que ce que l'historique dit neuf
 * ou annulé — la discipline de l'adaptateur append-only.
 */
export class PayerMeansStore {
  readonly rows: (PayerMeansEntry & {
    readonly legalEntityId: string;
    readonly payerCompanyId: string;
  })[] = [];
  saves = 0;
}

export class InMemoryPayerMeans extends PayerCollectionMeansRepository {
  constructor(private readonly store: PayerMeansStore) {
    super();
  }

  load(legalEntityId: string, payer: NamedPayer): Promise<PayerCollectionMeansHistory> {
    const entries = this.store.rows.filter(
      (row) => row.legalEntityId === legalEntityId && row.payerCompanyId === payer.id,
    );
    return Promise.resolve(PayerCollectionMeansHistory.reconstitute(legalEntityId, payer, entries));
  }

  save(history: PayerCollectionMeansHistory): Promise<void> {
    const record = history.toPersistence();
    this.store.saves += 1;
    for (const entry of record.entries) {
      const row = {
        ...entry,
        legalEntityId: record.legalEntityId,
        payerCompanyId: record.payerCompanyId,
      };
      if (record.freshIds.includes(entry.id)) {
        this.store.rows.push(row);
      } else if (record.cancelledIds.includes(entry.id)) {
        const index = this.store.rows.findIndex((stored) => stored.id === entry.id);
        this.store.rows[index] = row;
      }
    }
    return Promise.resolve();
  }
}

export class StorePayerMeansReader extends PayerCollectionMeansReader {
  constructor(private readonly store: PayerMeansStore) {
    super();
  }

  entriesOf(legalEntityId: string, payerCompanyId: string): Promise<readonly PayerMeansEntry[]> {
    return Promise.resolve(
      this.store.rows.filter(
        (row) => row.legalEntityId === legalEntityId && row.payerCompanyId === payerCompanyId,
      ),
    );
  }
}

/** Les payeurs qui ont un retour bancaire en attente — ce qu'on lui donne. */
export class FixedPendingReturns extends PendingBankReturnsReader {
  constructor(private readonly payers: ReadonlySet<string>) {
    super();
  }

  hasPendingReturn(_legalEntityId: string, payerCompanyId: string): Promise<boolean> {
    return Promise.resolve(this.payers.has(payerCompanyId));
  }
}

/** La seule entité `le1`, en lecture. */
export class OnlyLe1 extends LegalEntityReader {
  list(): Promise<readonly LegalEntityRecord[]> {
    return Promise.resolve([]);
  }
  byId(id: string): Promise<LegalEntityRecord | null> {
    return Promise.resolve(id === "le1" ? toView(declaredEntity(), true) : null);
  }
}
