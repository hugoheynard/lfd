import {
  CollectionNoticeNotQueuedError,
  InvalidCollectionNoticeError,
} from "../errors/collection-notice-errors.js";

export type CollectionNoticeKind = "notice" | "correction" | "cancellation" | "unchanged";
export type CollectionNoticeStatus = "queued" | "sent" | "failed" | "unsendable";
export type NoticeRecipientSource = "billing_contact" | "owner";

/** À qui l'avis part, et d'où vient l'adresse. */
export interface NoticeRecipient {
  readonly email: string;
  readonly source: NoticeRecipientSource;
}

/** Ce que l'avis promet au payeur : un montant, un jour. */
export interface NoticeTerms {
  readonly amountCents: number;
  /** `AAAA-MM-JJ` — l'échéance figée du lot. */
  readonly collectionDay: string;
}

/** La ligne de débit que l'avis annonce. `null` pour une annulation. */
export interface NoticeLineRef {
  readonly batchId: string;
  readonly lineRank: number;
  /** L'arrêté de la ligne : sa référence est imprimée sur l'avis. */
  readonly statementId: string;
}

export interface CollectionNoticeState {
  readonly id: string;
  readonly legalEntityId: string;
  readonly cycleClosesAt: Date;
  readonly line: NoticeLineRef | null;
  readonly debtorCompanyId: string;
  readonly debtorName: string;
  readonly kind: CollectionNoticeKind;
  readonly status: CollectionNoticeStatus;
  readonly recipient: NoticeRecipient | null;
  readonly terms: NoticeTerms;
  /** Ce que le dernier avis parti promettait — porté par un rectificatif. */
  readonly previous: NoticeTerms | null;
  readonly mandateReference: string;
  readonly creditor: { readonly name: string; readonly ics: string };
  /** L'avis parti que celui-ci rectifie, annule ou reconduit. */
  readonly supersedesId: string | null;
  readonly createdAt: Date;
  readonly sentAt: Date | null;
  readonly failedAt: Date | null;
  readonly failure: string | null;
}

/** Ce qu'il faut pour annoncer une ligne, ou l'annulation d'une promesse. */
export interface NoticeDraft {
  readonly id: string;
  readonly legalEntityId: string;
  readonly cycleClosesAt: Date;
  readonly line: NoticeLineRef | null;
  readonly debtorCompanyId: string;
  readonly debtorName: string;
  readonly recipient: NoticeRecipient | null;
  readonly terms: NoticeTerms;
  readonly mandateReference: string;
  readonly creditor: { readonly name: string; readonly ics: string };
  readonly at: Date;
}

/**
 * **L'avis de prélèvement d'un payeur** (pré-notification SEPA, plan
 * `documentation/facturation/prelevement-automatique.md`, PA2).
 *
 * Il garde deux règles, et rien d'autre ne les garde :
 *
 * - **envoyé ≠ mis en file** : seul un avis `queued` devient `sent` ou
 *   `failed`, une fois ; un avis sans adresse naît `unsendable` et le reste ;
 * - **un avis parti ne se reprend pas, il se corrige** : un rectificatif, une
 *   annulation ou une reconduction citent l'avis PARTI qu'ils suivent
 *   (`supersedesId`), et une reconduction n'existe que si les termes sont
 *   identiques.
 */
export class CollectionNotice {
  private constructor(private state: CollectionNoticeState) {}

  /** Le premier avis d'un payeur pour ce cycle. */
  static announce(draft: NoticeDraft): CollectionNotice {
    return CollectionNotice.fresh(draft, "notice", null, null);
  }

  /**
   * Le montant, le jour ou la RUM ont changé depuis l'avis parti `sent`.
   *
   * @throws {InvalidCollectionNoticeError} l'avis suivi n'est pas parti, ou rien n'a changé.
   */
  static correct(draft: NoticeDraft, sent: CollectionNotice): CollectionNotice {
    const before = sent.assertSentPromise();
    if (sameTerms(before, draft) && before.mandateReference === draft.mandateReference) {
      throw new InvalidCollectionNoticeError("un rectificatif qui ne change rien");
    }
    return CollectionNotice.fresh(draft, "correction", before.terms, before.id);
  }

  /**
   * Le payeur n'est plus prélevé : on annonce que la promesse ne tient plus.
   * L'avis n'appartient à aucun lot ; ses termes sont ceux qu'on annule.
   *
   * @throws {InvalidCollectionNoticeError} l'avis suivi n'est pas parti.
   */
  static cancel(
    sent: CollectionNotice,
    input: { id: string; recipient: NoticeRecipient | null; at: Date },
  ): CollectionNotice {
    const before = sent.assertSentPromise();
    return CollectionNotice.fresh(
      { ...before, id: input.id, line: null, recipient: input.recipient, at: input.at },
      "cancellation",
      null,
      before.id,
    );
  }

  /**
   * Rien n'a changé : l'avis parti tient toujours. Aucun envoi — la ligne
   * reprend son état `sent` et son destinataire.
   *
   * @throws {InvalidCollectionNoticeError} l'avis suivi n'est pas parti, ou les termes diffèrent.
   */
  static carry(draft: NoticeDraft, sent: CollectionNotice): CollectionNotice {
    const before = sent.assertSentPromise();
    if (!sameTerms(before, draft) || before.mandateReference !== draft.mandateReference) {
      throw new InvalidCollectionNoticeError("une reconduction dont les termes ont changé");
    }
    return new CollectionNotice({
      ...stateOf(draft, "unchanged", null, before.id),
      recipient: before.recipient,
      status: "sent",
      sentAt: before.sentAt,
    });
  }

  static rehydrate(state: CollectionNoticeState): CollectionNotice {
    return new CollectionNotice(state);
  }

  private static fresh(
    draft: NoticeDraft,
    kind: CollectionNoticeKind,
    previous: NoticeTerms | null,
    supersedesId: string | null,
  ): CollectionNotice {
    if (!Number.isInteger(draft.terms.amountCents) || draft.terms.amountCents <= 0) {
      throw new InvalidCollectionNoticeError(`montant ${draft.terms.amountCents} centimes`);
    }
    return new CollectionNotice(stateOf(draft, kind, previous, supersedesId));
  }

  /** @throws {CollectionNoticeNotQueuedError} */
  markSent(at: Date): void {
    this.assertQueued();
    this.state = { ...this.state, status: "sent", sentAt: at };
  }

  /** @throws {CollectionNoticeNotQueuedError} */
  markFailed(at: Date, failure: string): void {
    this.assertQueued();
    this.state = { ...this.state, status: "failed", failedAt: at, failure };
  }

  /** Un avis qui part par la boîte d'envoi : en file, avec une adresse. */
  get needsSending(): boolean {
    return this.state.status === "queued";
  }

  /** Une promesse faite au payeur : un avis parti qui n'est pas une annulation. */
  get isSentPromise(): boolean {
    return this.state.status === "sent" && this.state.kind !== "cancellation";
  }

  get id(): string {
    return this.state.id;
  }
  get status(): CollectionNoticeStatus {
    return this.state.status;
  }
  get kind(): CollectionNoticeKind {
    return this.state.kind;
  }

  toPersistence(): CollectionNoticeState {
    return this.state;
  }

  private assertQueued(): void {
    if (this.state.status !== "queued") {
      throw new CollectionNoticeNotQueuedError(this.state.id, this.state.status);
    }
  }

  private assertSentPromise(): CollectionNoticeState {
    if (!this.isSentPromise) {
      throw new InvalidCollectionNoticeError(
        `l'avis suivi ${this.state.id} n'est pas une promesse partie (${this.state.kind}, ${this.state.status})`,
      );
    }
    return this.state;
  }
}

function stateOf(
  draft: NoticeDraft,
  kind: CollectionNoticeKind,
  previous: NoticeTerms | null,
  supersedesId: string | null,
): CollectionNoticeState {
  return {
    id: draft.id,
    legalEntityId: draft.legalEntityId,
    cycleClosesAt: draft.cycleClosesAt,
    line: draft.line,
    debtorCompanyId: draft.debtorCompanyId,
    debtorName: draft.debtorName,
    kind,
    status: draft.recipient === null ? "unsendable" : "queued",
    recipient: draft.recipient,
    terms: draft.terms,
    previous,
    mandateReference: draft.mandateReference,
    creditor: draft.creditor,
    supersedesId,
    createdAt: draft.at,
    sentAt: null,
    failedAt: null,
    failure: null,
  };
}

function sameTerms(left: { readonly terms: NoticeTerms }, right: { readonly terms: NoticeTerms }) {
  return (
    left.terms.amountCents === right.terms.amountCents &&
    left.terms.collectionDay === right.terms.collectionDay
  );
}
