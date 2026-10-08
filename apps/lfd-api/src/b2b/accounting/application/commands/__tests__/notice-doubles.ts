import type { DurableFact } from "../../../../../platform/outbox/durable-event.js";
import { DurablePublisher } from "../../../../../platform/outbox/durable-publisher.js";
import type {
  CollectionNotice,
  CollectionNoticeStatus,
} from "../../../domain/entities/collection-notice.js";
import { BatchNoticeStatesReader } from "../../../domain/ports/batch-notice-states.reader.js";
import { CollectionNoticeRepository } from "../../../domain/ports/collection-notice.repository.js";
import { CycleNoticesReader } from "../../../domain/ports/cycle-notices.reader.js";
import { PayerNoticeContactsReader } from "../../../domain/ports/payer-notice-contacts.reader.js";
import type { CycleNotice } from "../../../domain/services/collection-notice-plan.js";
import type { PayerNoticeContacts } from "../../../domain/services/collection-notice-recipient.js";
import type { MemoryBatches } from "./collection-doubles.js";

/**
 * Doublés de l'avis de prélèvement (PA2), chacun héritant de son port. Les
 * avis vivent dans UN magasin, que les trois ports lisent : c'est ce qui fait
 * qu'une reconstitution relit ce que la constitution a écrit.
 */
export class NoticeStore {
  readonly notices: CollectionNotice[] = [];

  ofDebtor(debtorCompanyId: string): readonly CollectionNotice[] {
    return this.notices.filter(
      (notice) => notice.toPersistence().debtorCompanyId === debtorCompanyId,
    );
  }
}

export class MemoryNotices extends CollectionNoticeRepository {
  constructor(private readonly store: NoticeStore) {
    super();
  }
  insertAll(notices: readonly CollectionNotice[]): Promise<void> {
    this.store.notices.push(...notices);
    return Promise.resolve();
  }
  load(noticeId: string): Promise<CollectionNotice | null> {
    return Promise.resolve(this.store.notices.find((notice) => notice.id === noticeId) ?? null);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
}

/** Le lot d'un avis est vivant s'il n'est pas annulé — lu dans les lots enregistrés. */
export class MemoryCycleNotices extends CycleNoticesReader {
  constructor(
    private readonly store: NoticeStore,
    private readonly batches: MemoryBatches,
  ) {
    super();
  }
  ofCycle(legalEntityId: string, cycleClosesAt: Date): Promise<readonly CycleNotice[]> {
    return Promise.resolve(
      this.store.notices
        .filter((notice) => {
          const state = notice.toPersistence();
          return (
            state.legalEntityId === legalEntityId &&
            state.cycleClosesAt.getTime() === cycleClosesAt.getTime()
          );
        })
        .map((notice) => {
          const batchId = notice.toPersistence().line?.batchId;
          const status = batchId === undefined ? undefined : this.batches.storedStatus.get(batchId);
          return { notice, batchLive: status !== undefined && status !== "cancelled" };
        }),
    );
  }
}

export class MemoryBatchNoticeStates extends BatchNoticeStatesReader {
  constructor(private readonly store: NoticeStore) {
    super();
  }
  ofBatch(batchId: string): Promise<ReadonlyMap<number, CollectionNoticeStatus>> {
    return Promise.resolve(
      new Map(
        this.store.notices.flatMap((notice) => {
          const line = notice.toPersistence().line;
          return line?.batchId === batchId ? [[line.lineRank, notice.status] as const] : [];
        }),
      ),
    );
  }
}

/** Par défaut, chaque payeur a un contact de facturation `compta@<id>.test`. */
export class FixedNoticeContacts extends PayerNoticeContactsReader {
  readonly overrides = new Map<string, PayerNoticeContacts>();
  contactsOf(companyIds: readonly string[]): Promise<ReadonlyMap<string, PayerNoticeContacts>> {
    return Promise.resolve(
      new Map(
        companyIds.map((id) => [
          id,
          this.overrides.get(id) ?? {
            billingContactEmails: [`compta@${id}.test`],
            ownerEmail: null,
          },
        ]),
      ),
    );
  }
}

export class RecordingDurable extends DurablePublisher {
  readonly facts: DurableFact[] = [];
  publish(fact: DurableFact): Promise<void> {
    this.facts.push(fact);
    return Promise.resolve();
  }
}

/** Marque envoyés tous les avis en file — ce que l'abonné ferait après la validation. */
export function sendAllQueued(store: NoticeStore, at: Date): void {
  for (const notice of store.notices) {
    if (notice.needsSending) {
      notice.markSent(at);
    }
  }
}
