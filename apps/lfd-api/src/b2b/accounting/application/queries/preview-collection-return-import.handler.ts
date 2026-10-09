import type { CollectionReturnImportPreviewView, ImportedReturnView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { returnedBatchLabel } from "../../domain/events/collection-return.events.js";
import { ReturnableLinesReader } from "../../domain/ports/returnable-lines.reader.js";
import { readBankReturnFile } from "../../domain/services/bank-return-file.js";
import { reasonDescription } from "../../domain/value-objects/bank-return-reason.js";
import { classifyReturns, type ClassifiedReturn } from "../collection-return-import-support.js";
import { PreviewCollectionReturnImportQuery } from "./collection-return-queries.js";

/**
 * **L'aperçu d'un fichier de retours** (R5b) : chaque transaction du fichier,
 * appariée par `EndToEndId` — appariée, inconnue, montant différent, déjà
 * retournée, ou refusée par la règle (lot non déposé, remboursement en B2B).
 * Rien n'est écrit : le staff confirme ensuite ce qu'il retient.
 */
@QueryHandler(PreviewCollectionReturnImportQuery)
export class PreviewCollectionReturnImportHandler implements IQueryHandler<
  PreviewCollectionReturnImportQuery,
  CollectionReturnImportPreviewView
> {
  constructor(
    private readonly lines: ReturnableLinesReader,
    private readonly clock: Clock,
  ) {}

  async execute(
    query: PreviewCollectionReturnImportQuery,
  ): Promise<CollectionReturnImportPreviewView> {
    const file = readBankReturnFile(query.xml);
    const classified = await classifyReturns(this.lines, file, this.clock.now());
    return { format: file.format, entries: classified.map(toView) };
  }
}

function toView({ entry, reason, line, status, problem }: ClassifiedReturn): ImportedReturnView {
  return {
    endToEndId: entry.endToEndId,
    status,
    kind: entry.kind,
    reasonCode: reason.code,
    reason: reasonDescription(reason.code, reason.label),
    returnedOn: entry.returnedOn,
    amountCents: entry.amountCents,
    lineAmountCents: line?.amountCents ?? null,
    debtorName: line?.debtorName ?? null,
    batchLabel: line === null ? null : returnedBatchLabel(line),
    problem,
  };
}
