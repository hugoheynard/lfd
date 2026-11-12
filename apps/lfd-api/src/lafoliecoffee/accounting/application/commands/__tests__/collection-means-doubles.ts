import type { NamedPayer } from "../../../domain/entities/payer-billing-mode-history.js";
import { PayerCollectionMeansHistory } from "../../../domain/entities/payer-collection-means-history.js";
import { PayerCollectionMeansReader } from "../../../domain/ports/payer-collection-means.reader.js";
import { PayerCollectionMeansRepository } from "../../../domain/ports/payer-collection-means.repository.js";
import {
  LegalEntityReader,
  type LegalEntityRecord,
} from "../../../domain/ports/legal-entity.reader.js";
import { PayerChangeLock } from "../../../domain/ports/payer-change-lock.js";
import { PayersCollectionMeansReader } from "../../../domain/ports/payers-collection-means.reader.js";
import type { CollectionMeans } from "../../../domain/value-objects/collection-means.js";
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

/**
 * Le verrou du payeur (K11), doublé : il note qui a été verrouillé, et
 * rejoue ce qu'un geste concurrent aurait validé PENDANT qu'on l'attendait
 * (`whileWaiting`) — un handler qui lirait avant de verrouiller ne le
 * verrait pas.
 */
export class RecordingPayerLock extends PayerChangeLock {
  readonly locked: string[] = [];

  constructor(private readonly whileWaiting: () => void = () => undefined) {
    super();
  }

  lock(payerCompanyId: string): Promise<void> {
    this.locked.push(payerCompanyId);
    this.whileWaiting();
    return Promise.resolve();
  }
}

/**
 * La lecture groupée du moyen (K10), sur le même magasin que le dépôt. Sans
 * magasin : personne n'a jamais rien changé, tous au prélèvement.
 */
export class StorePayersMeansReader extends PayersCollectionMeansReader {
  constructor(private readonly store: PayerMeansStore = new PayerMeansStore()) {
    super();
  }

  entriesOfPayers(
    legalEntityId: string,
    payerCompanyIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly PayerMeansEntry[]>> {
    const byPayer = new Map<string, PayerMeansEntry[]>();
    for (const row of this.store.rows) {
      if (row.legalEntityId === legalEntityId && payerCompanyIds.includes(row.payerCompanyId)) {
        byPayer.set(row.payerCompanyId, [...(byPayer.get(row.payerCompanyId) ?? []), row]);
      }
    }
    return Promise.resolve(byPayer);
  }
}

/** Un segment de moyen déjà en base, pour une fixture. */
export function meansRow(
  payerCompanyId: string,
  means: CollectionMeans,
  effectiveFrom: Date,
  legalEntityId = "le1",
): PayerMeansStore["rows"][number] {
  return {
    id: `means_${payerCompanyId}_${effectiveFrom.toISOString()}`,
    legalEntityId,
    payerCompanyId,
    effectiveFrom,
    means,
    reason: "Demande écrite du client",
    createdAt: effectiveFrom,
    createdByStaffId: "staff_0",
    cancelledAt: null,
    cancelledByStaffId: null,
  };
}
