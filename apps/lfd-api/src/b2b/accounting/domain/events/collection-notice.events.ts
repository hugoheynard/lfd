import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { CollectionNotice, CollectionNoticeState } from "../entities/collection-notice.js";
import { COLLECTION_FACT_TYPES } from "./accounting-facts.js";

const NOTICE_SUBJECT = "collection_notice";

/** L'entité émettrice de l'avis, avec son nom du moment. */
export interface NoticeEntity {
  readonly id: string;
  readonly name: string;
}

/** Les faits d'un avis — l'état qu'il vient de prendre en décide le type. */
type NoticeFactType =
  | typeof COLLECTION_FACT_TYPES.noticeQueued
  | typeof COLLECTION_FACT_TYPES.noticeUnsendable
  | typeof COLLECTION_FACT_TYPES.noticeSent
  | typeof COLLECTION_FACT_TYPES.noticeFailed;

const FACT_TYPE_OF: Readonly<Record<CollectionNotice["status"], NoticeFactType>> = {
  queued: COLLECTION_FACT_TYPES.noticeQueued,
  unsendable: COLLECTION_FACT_TYPES.noticeUnsendable,
  sent: COLLECTION_FACT_TYPES.noticeSent,
  failed: COLLECTION_FACT_TYPES.noticeFailed,
};

/**
 * **Un avis de prélèvement change d'état** (PA2) : mis en file ou non
 * envoyable à la constitution, envoyé ou en échec après. Jamais l'adresse du
 * destinataire dans le journal : d'où elle vient suffit à la retrouver.
 */
export class CollectionNoticeEvent implements JournaledEvent {
  /** L'avis TEL QU'IL ÉTAIT : l'agrégat peut changer d'état après la publication. */
  readonly state: CollectionNoticeState;

  constructor(
    notice: CollectionNotice,
    readonly entity: NoticeEntity,
    readonly at: Date,
  ) {
    this.state = notice.toPersistence();
  }

  journalFact(): JournalFact {
    const state = this.state;
    const common = {
      subjectLabel: `Avis ${state.debtorName}`,
      legalEntity: { id: this.entity.id, name: this.entity.name },
      payer: { id: state.debtorCompanyId, name: state.debtorName },
      kind: state.kind,
      amountCents: state.terms.amountCents,
      collectionDay: state.terms.collectionDay,
      previousAmountCents: state.previous?.amountCents ?? null,
      previousCollectionDay: state.previous?.collectionDay ?? null,
      recipientSource: state.recipient?.source ?? null,
    };
    return {
      type: FACT_TYPE_OF[state.status],
      subjectType: NOTICE_SUBJECT,
      subjectId: state.id,
      occurredAt: this.at,
      payload: state.status === "failed" ? { ...common, failure: state.failure ?? "" } : common,
    };
  }
}
