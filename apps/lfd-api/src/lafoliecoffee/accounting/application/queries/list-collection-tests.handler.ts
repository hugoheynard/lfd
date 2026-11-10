import type { CollectionTestView, CollectionTestsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { Clock } from "../../../../platform/time/clock.js";
import { collectionTestStatus } from "../../domain/entities/collection-test-status.js";
import {
  CollectionTestsReader,
  type CollectionTestSummary,
} from "../../domain/ports/collection-tests.reader.js";
import { parisDayOf } from "../../domain/services/collection-test-file.js";
import { reasonDescription } from "../../domain/value-objects/bank-return-reason.js";
import { ListCollectionTestsQuery } from "./collection-test-queries.js";

/**
 * **La liste « Essais »** : chaque essai, son état du jour (« à rembourser »
 * après l'échéance sans retour, Q4), son retour bancaire rattaché et son
 * remboursement. Sans IBAN, sans fichier.
 */
@QueryHandler(ListCollectionTestsQuery)
export class ListCollectionTestsHandler implements IQueryHandler<
  ListCollectionTestsQuery,
  CollectionTestsView
> {
  constructor(
    private readonly tests: CollectionTestsReader,
    private readonly authors: StaffAuthorDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<CollectionTestsView> {
    const today = parisDayOf(this.clock.now());
    const rows = await this.tests.list();
    const authors = await this.authors.identify(
      rows.flatMap((row) => [row.created.staffId, row.refund?.recorded.staffId ?? null]),
    );
    return {
      tests: rows.map((row) => ({
        ...viewOf(row),
        status: collectionTestStatus(row, today),
        createdByName: authors.nameOf(row.created.staffId),
        refundedByName: authors.nameOf(row.refund?.recorded.staffId ?? null),
      })),
    };
  }
}

function viewOf(
  row: CollectionTestSummary,
): Omit<CollectionTestView, "status" | "createdByName" | "refundedByName"> {
  const { bankReturn } = row;
  return {
    id: row.id,
    messageId: row.messageId,
    debtorCompanyId: row.debtorCompanyId,
    debtorName: row.debtorName,
    mandateReference: row.mandateReference,
    scheme: row.scheme,
    sequence: row.sequence,
    amountCents: row.amountCents,
    requestedCollectionDay: row.requestedCollectionDay,
    remittance: row.remittance,
    createdAt: row.created.at.toISOString(),
    bankReturn:
      bankReturn === null
        ? null
        : {
            kind: bankReturn.kind,
            reasonCode: bankReturn.reasonCode,
            reason: reasonDescription(bankReturn.reasonCode, bankReturn.reasonLabel),
            returnedOn: bankReturn.returnedOn,
            amountCents: bankReturn.amountCents,
          },
    refundedOn: row.refund?.refundedOn ?? null,
  };
}
