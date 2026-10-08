import {
  CollectionNotice,
  type NoticeDraft,
  type NoticeLineRef,
} from "../entities/collection-notice.js";
import { noticeRecipientOf, type PayerNoticeContacts } from "./collection-notice-recipient.js";

/** Une ligne de débit à annoncer. */
export interface NoticeLine {
  readonly ref: NoticeLineRef;
  readonly debtorCompanyId: string;
  readonly debtorName: string;
  readonly amountCents: number;
  readonly mandateReference: string;
}

/** Un avis déjà écrit pour ce cycle, et si le lot qui le porte est encore vivant. */
export interface CycleNotice {
  readonly notice: CollectionNotice;
  /** Son lot n'est pas annulé. Une annulation n'a pas de lot : `false`. */
  readonly batchLive: boolean;
}

export interface NoticePlanInput {
  readonly legalEntityId: string;
  readonly cycleClosesAt: Date;
  readonly collectionDay: string;
  readonly creditor: { readonly name: string; readonly ics: string };
  readonly lines: readonly NoticeLine[];
  /** Tous les avis du cycle, dans l'ordre d'écriture (ULID croissant). */
  readonly earlier: readonly CycleNotice[];
  readonly contacts: ReadonlyMap<string, PayerNoticeContacts>;
  readonly at: Date;
  readonly nextId: () => string;
}

/**
 * **Les avis d'une constitution** (PA2) : un par ligne de débit, plus une
 * annulation par payeur à qui un lot annulé avait promis un prélèvement qui
 * n'a plus lieu.
 *
 * La promesse d'un payeur est son DERNIER avis du cycle, s'il est parti et
 * que son lot est annulé. Un avis jamais parti (en file, en échec, non
 * envoyable) ne promet rien : la ligne reçoit un avis neuf. Un payeur dont le
 * dernier avis vit dans un lot encore vivant (l'autre schéma) n'est pas
 * touché.
 *
 * Pour chaque ligne : promesse identique (montant, jour, RUM) → reconduite,
 * rien ne part ; différente → rectificatif ; aucune → premier avis.
 */
export function planNotices(input: NoticePlanInput): readonly CollectionNotice[] {
  const promises = pendingPromises(input.earlier);
  const announced = input.lines.map((line) => noticeForLine(input, line, promises));
  const lineDebtors = new Set(input.lines.map((line) => line.debtorCompanyId));
  const cancellations = [...promises.values()]
    .filter((promise) => !lineDebtors.has(promise.toPersistence().debtorCompanyId))
    .map((promise) => {
      const debtorId = promise.toPersistence().debtorCompanyId;
      return CollectionNotice.cancel(promise, {
        id: input.nextId(),
        recipient: recipientOrFormer(input.contacts.get(debtorId), promise),
        at: input.at,
      });
    });
  return [...announced, ...cancellations];
}

function noticeForLine(
  input: NoticePlanInput,
  line: NoticeLine,
  promises: ReadonlyMap<string, CollectionNotice>,
): CollectionNotice {
  const promise = promises.get(line.debtorCompanyId);
  const contacts = input.contacts.get(line.debtorCompanyId);
  const draft: NoticeDraft = {
    id: input.nextId(),
    legalEntityId: input.legalEntityId,
    cycleClosesAt: input.cycleClosesAt,
    line: line.ref,
    debtorCompanyId: line.debtorCompanyId,
    debtorName: line.debtorName,
    recipient: noticeRecipientOf(contacts),
    terms: { amountCents: line.amountCents, collectionDay: input.collectionDay },
    mandateReference: line.mandateReference,
    creditor: input.creditor,
    at: input.at,
  };
  if (promise === undefined) {
    return CollectionNotice.announce(draft);
  }
  const before = promise.toPersistence();
  const unchanged =
    before.terms.amountCents === draft.terms.amountCents &&
    before.terms.collectionDay === draft.terms.collectionDay &&
    before.mandateReference === draft.mandateReference;
  return unchanged
    ? CollectionNotice.carry(draft, promise)
    : CollectionNotice.correct(
        { ...draft, recipient: recipientOrFormer(contacts, promise) },
        promise,
      );
}

/** Le dernier avis de chaque payeur, gardé s'il est une promesse d'un lot annulé. */
function pendingPromises(earlier: readonly CycleNotice[]): ReadonlyMap<string, CollectionNotice> {
  const latest = new Map<string, CycleNotice>();
  for (const entry of earlier) {
    latest.set(entry.notice.toPersistence().debtorCompanyId, entry);
  }
  return new Map(
    [...latest.entries()]
      .filter(([, entry]) => !entry.batchLive && entry.notice.isSentPromise)
      .map(([debtorId, entry]) => [debtorId, entry.notice]),
  );
}

/**
 * Un rectificatif ou une annulation va d'abord à l'adresse d'aujourd'hui ; si
 * elle a disparu, à celle qui a reçu l'avis qu'on corrige — elle a été jointe.
 */
function recipientOrFormer(
  contacts: PayerNoticeContacts | undefined,
  promise: CollectionNotice,
): ReturnType<typeof noticeRecipientOf> {
  return noticeRecipientOf(contacts) ?? promise.toPersistence().recipient;
}
