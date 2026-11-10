import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/** Nom STABLE du fait — clé de routage vers son abonné. */
export const COLLECTION_NOTICE_QUEUED = "collection.notice_to_send";

/**
 * **Un avis de prélèvement est en file** — écrit dans la boîte d'envoi, dans
 * la transaction du lot (PA2). `{ noticeId }`, rien d'autre : l'abonné relit
 * l'avis, qui porte tout ce qu'il imprime. Clé :
 * `collection.notice_to_send:<noticeId>`, un avis ne se met en file qu'une fois.
 */
export class CollectionNoticeQueuedFact implements DurableEvent {
  constructor(readonly noticeId: string) {}

  durableFact(): DurableFact {
    return {
      type: COLLECTION_NOTICE_QUEUED,
      key: `${COLLECTION_NOTICE_QUEUED}:${this.noticeId}`,
      payload: { noticeId: this.noticeId },
    };
  }

  /** @throws {CollectionNoticeQueuedPayloadError} */
  static fromPayload(payload: Readonly<Record<string, unknown>>): CollectionNoticeQueuedFact {
    const noticeId = payload["noticeId"];
    if (typeof noticeId !== "string" || noticeId.length === 0) {
      throw new CollectionNoticeQueuedPayloadError();
    }
    return new CollectionNoticeQueuedFact(noticeId);
  }
}

/** Un fait illisible : rien n'est envoyé, le message reste dans la boîte d'envoi. */
export class CollectionNoticeQueuedPayloadError extends TechnicalError {
  constructor() {
    super(
      "accounting.collection.notice_payload_invalid",
      "Le fait « avis de prélèvement en file » est illisible (avis manquant) : aucun avis n'est parti, et le lot reste non déposable. Corriger l'émetteur puis rejouer le message depuis la carte de santé.",
    );
  }
}
