import type { CollectionNotice as CollectionNoticeRow } from "../../../platform/database/client/client.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import type {
  CollectionNoticeState,
  NoticeRecipient,
  NoticeRecipientSource,
} from "../domain/entities/collection-notice.js";

const SOURCES: readonly NoticeRecipientSource[] = ["billing_contact", "owner"];

/** Un jour local écrit à minuit UTC : la colonne est un DATE, sans fuseau. */
export function dayColumn(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function dayOf(column: Date): string {
  return column.toISOString().slice(0, 10);
}

/** Ligne → état du domaine. Les énumérations Prisma ont les mêmes valeurs. */
export function toNoticeState(row: CollectionNoticeRow): CollectionNoticeState {
  return {
    id: row.id,
    legalEntityId: row.legalEntityId,
    cycleClosesAt: row.cycleClosesAt,
    line:
      row.batchId === null || row.lineRank === null
        ? null
        : { batchId: row.batchId, lineRank: row.lineRank, statementId: row.statementId ?? "" },
    debtorCompanyId: row.debtorCompanyId,
    debtorName: row.debtorName,
    kind: row.kind,
    status: row.status,
    recipient: recipientOf(row),
    terms: { amountCents: row.amountCents, collectionDay: dayOf(row.collectionDay) },
    previous:
      row.previousAmountCents === null || row.previousCollectionDay === null
        ? null
        : {
            amountCents: row.previousAmountCents,
            collectionDay: dayOf(row.previousCollectionDay),
          },
    mandateReference: row.mandateReference,
    creditor: { name: row.creditorName, ics: row.creditorIcs },
    supersedesId: row.supersedesId,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
    failedAt: row.failedAt,
    failure: row.failure,
  };
}

/** Les colonnes qui changent avec l'état — tout le reste est écrit une fois. */
export function noticeStateColumns(state: CollectionNoticeState) {
  return {
    status: state.status,
    sentAt: state.sentAt,
    failedAt: state.failedAt,
    failure: state.failure,
  };
}

/** État du domaine → ligne complète, à la création. */
export function noticeColumns(state: CollectionNoticeState) {
  return {
    id: state.id,
    legalEntityId: state.legalEntityId,
    cycleClosesAt: state.cycleClosesAt,
    batchId: state.line?.batchId ?? null,
    lineRank: state.line?.lineRank ?? null,
    statementId: state.line?.statementId ?? null,
    debtorCompanyId: state.debtorCompanyId,
    debtorName: state.debtorName,
    kind: state.kind,
    recipientEmail: state.recipient?.email ?? null,
    recipientSource: state.recipient?.source ?? null,
    amountCents: state.terms.amountCents,
    collectionDay: dayColumn(state.terms.collectionDay),
    previousAmountCents: state.previous?.amountCents ?? null,
    previousCollectionDay: state.previous === null ? null : dayColumn(state.previous.collectionDay),
    mandateReference: state.mandateReference,
    creditorName: state.creditor.name,
    creditorIcs: state.creditor.ics,
    supersedesId: state.supersedesId,
    createdAt: state.createdAt,
    ...noticeStateColumns(state),
  };
}

function recipientOf(row: CollectionNoticeRow): NoticeRecipient | null {
  if (row.recipientEmail === null || row.recipientSource === null) {
    return null;
  }
  const source = SOURCES.find((candidate) => candidate === row.recipientSource);
  if (source === undefined) {
    throw new CorruptNoticeError(row.id, row.recipientSource);
  }
  return { email: row.recipientEmail, source };
}

/** Inatteignable tant que le `CHECK` existe ; on refuse plutôt que deviner. */
class CorruptNoticeError extends TechnicalError {
  constructor(noticeId: string, raw: string) {
    super(
      "accounting.collection.corrupt_notice",
      `L'avis de prélèvement ${noticeId} porte la source d'adresse « ${raw} », ni contact de facturation ni détenteur : la contrainte collection_notice_recipient a été levée. Prévenir la technique.`,
    );
  }
}
