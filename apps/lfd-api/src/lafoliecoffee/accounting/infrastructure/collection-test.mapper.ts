import type {
  CollectionTestFile as CollectionTestFileRow,
  CollectionTest as CollectionTestLineRow,
} from "../../../platform/database/client/client.js";
import type { CollectionTestFileState } from "../domain/entities/collection-test-file.js";
import type {
  CollectionTestState,
  TestBankReturn,
  TestRefund,
} from "../domain/entities/collection-test.js";
import type { TestSequence } from "../domain/services/pain008-document.js";
import { CorruptCollectionTestRowError } from "./collection-test-row.error.js";
import { returnDayColumn, returnDayOf } from "./collection-return.mapper.js";

const SEQUENCES: readonly TestSequence[] = ["RCUR", "FRST", "OOFF"];

/** Une ligne d'essai, avec le `MsgId` de son envoi. */
export type CollectionTestRow = CollectionTestLineRow & {
  readonly file: Pick<CollectionTestFileRow, "messageId">;
};

/** Ce qu'une lecture d'essai joint de son envoi. */
export const WITH_FILE_MESSAGE_ID = { file: { select: { messageId: true } } } as const;

function sequenceOf(row: CollectionTestRow): TestSequence {
  const found = SEQUENCES.find((sequence) => sequence === row.sequence);
  if (found === undefined) {
    throw new CorruptCollectionTestRowError(row.id, `séquence « ${row.sequence} »`);
  }
  return found;
}

function bankReturnOf(row: CollectionTestRow): TestBankReturn | null {
  const {
    returnKind,
    returnReasonCode,
    returnedOn,
    returnAmountCents,
    returnSource,
    returnRecordedAt,
    returnRecordedByStaffId,
  } = row;
  if (
    returnKind === null ||
    returnReasonCode === null ||
    returnedOn === null ||
    returnAmountCents === null ||
    returnSource === null ||
    returnRecordedAt === null ||
    returnRecordedByStaffId === null
  ) {
    return null;
  }
  return {
    kind: returnKind,
    reasonCode: returnReasonCode,
    reasonLabel: row.returnReasonLabel,
    returnedOn: returnDayOf(returnedOn),
    amountCents: returnAmountCents,
    source: returnSource,
    recorded: { at: returnRecordedAt, staffId: returnRecordedByStaffId },
  };
}

function refundOf(row: CollectionTestRow): TestRefund | null {
  if (
    row.refundedOn === null ||
    row.refundRecordedAt === null ||
    row.refundRecordedByStaffId === null
  ) {
    return null;
  }
  return {
    refundedOn: returnDayOf(row.refundedOn),
    recorded: { at: row.refundRecordedAt, staffId: row.refundRecordedByStaffId },
  };
}

/** Ligne → état du domaine. */
export function toCollectionTestState(row: CollectionTestRow): CollectionTestState {
  return {
    id: row.id,
    fileId: row.fileId,
    legalEntityId: row.legalEntityId,
    debtorCompanyId: row.debtorCompanyId,
    debtorName: row.debtorName,
    mandateId: row.mandateId,
    mandateReference: row.mandateReference,
    scheme: row.scheme,
    sequence: sequenceOf(row),
    amountCents: row.amountCents,
    requestedCollectionDay: returnDayOf(row.requestedCollectionDay),
    remittance: row.remittance,
    messageId: row.file.messageId,
    endToEndId: row.endToEndId,
    created: { at: row.createdAt, staffId: row.createdByStaffId },
    bankReturn: bankReturnOf(row),
    refund: refundOf(row),
  };
}

/** Ce qu'un `save` ultérieur réécrit : le retour et le remboursement, jamais le fichier. */
export function collectionTestFollowUpColumns(state: CollectionTestState) {
  const { bankReturn, refund } = state;
  return {
    returnKind: bankReturn?.kind ?? null,
    returnReasonCode: bankReturn?.reasonCode ?? null,
    returnReasonLabel: bankReturn?.reasonLabel ?? null,
    returnedOn: bankReturn === null ? null : returnDayColumn(bankReturn.returnedOn),
    returnAmountCents: bankReturn?.amountCents ?? null,
    returnSource: bankReturn?.source ?? null,
    returnRecordedAt: bankReturn?.recorded.at ?? null,
    returnRecordedByStaffId: bankReturn?.recorded.staffId ?? null,
    refundedOn: refund === null ? null : returnDayColumn(refund.refundedOn),
    refundRecordedAt: refund?.recorded.at ?? null,
    refundRecordedByStaffId: refund?.recorded.staffId ?? null,
  };
}

/**
 * État → toutes les colonnes, à la création. `message_id`, `xml` et
 * `file_sha256` ne s'écrivent plus : ils sont ceux de l'envoi.
 */
export function collectionTestColumns(state: CollectionTestState) {
  return {
    id: state.id,
    fileId: state.fileId,
    legalEntityId: state.legalEntityId,
    debtorCompanyId: state.debtorCompanyId,
    debtorName: state.debtorName,
    mandateId: state.mandateId,
    mandateReference: state.mandateReference,
    scheme: state.scheme,
    sequence: state.sequence,
    amountCents: state.amountCents,
    requestedCollectionDay: returnDayColumn(state.requestedCollectionDay),
    remittance: state.remittance,
    endToEndId: state.endToEndId,
    createdAt: state.created.at,
    createdByStaffId: state.created.staffId,
    ...collectionTestFollowUpColumns(state),
  };
}

/** Envoi → ses colonnes, à sa naissance (il ne s'écrit jamais ensuite). */
export function collectionTestFileColumns(state: CollectionTestFileState) {
  return {
    id: state.id,
    legalEntityId: state.legalEntityId,
    scheme: state.scheme,
    requestedCollectionDay: returnDayColumn(state.requestedCollectionDay),
    messageId: state.messageId,
    xml: state.xml,
    fileSha256: state.fileSha256,
    createdAt: state.created.at,
    createdByStaffId: state.created.staffId,
  };
}
