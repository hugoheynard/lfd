import type { CollectionReturnImportPreviewView, ImportedReturnView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { returnedBatchLabel } from "../../domain/events/collection-return.events.js";
import { CollectionTestReturnTargetsReader } from "../../domain/ports/collection-test-return-targets.reader.js";
import { ReturnableLinesReader } from "../../domain/ports/returnable-lines.reader.js";
import { readBankReturnFile } from "../../domain/services/bank-return-file.js";
import { reasonDescription } from "../../domain/value-objects/bank-return-reason.js";
import { classifyReturns, type ClassifiedReturn } from "../collection-return-import-support.js";
import { PreviewCollectionReturnImportQuery } from "./collection-return-queries.js";

/**
 * **L'aperçu d'un fichier de retours** (R5b) : chaque transaction du fichier,
 * appariée par `EndToEndId` — appariée, inconnue, montant différent, déjà
 * retournée, ou refusée par la règle (lot non déposé, remboursement en B2B).
 * Rien n'est écrit : le staff confirme ensuite ce qu'il retient. Une référence
 * `ESS-…` se rattache à son prélèvement d'essai, jamais à un lot.
 */
@QueryHandler(PreviewCollectionReturnImportQuery)
export class PreviewCollectionReturnImportHandler implements IQueryHandler<
  PreviewCollectionReturnImportQuery,
  CollectionReturnImportPreviewView
> {
  constructor(
    private readonly lines: ReturnableLinesReader,
    private readonly tests: CollectionTestReturnTargetsReader,
    private readonly clock: Clock,
  ) {}

  async execute(
    query: PreviewCollectionReturnImportQuery,
  ): Promise<CollectionReturnImportPreviewView> {
    const file = readBankReturnFile(query.xml);
    const classified = await classifyReturns(
      { lines: this.lines, tests: this.tests },
      file,
      this.clock.now(),
    );
    return { format: file.format, entries: classified.map(toView) };
  }
}

function toView({
  entry,
  reason,
  line,
  test,
  status,
  problem,
}: ClassifiedReturn): ImportedReturnView {
  return {
    endToEndId: entry.endToEndId,
    status,
    kind: entry.kind,
    reasonCode: reason.code,
    reason: reasonDescription(reason.code, reason.label),
    returnedOn: entry.returnedOn,
    amountCents: entry.amountCents,
    lineAmountCents: line?.amountCents ?? test?.amountCents ?? null,
    debtorName: line?.debtorName ?? test?.debtorName ?? null,
    batchLabel: labelOf(line, test),
    problem,
  };
}

function labelOf(line: ClassifiedReturn["line"], test: ClassifiedReturn["test"]): string | null {
  if (line !== null) {
    return returnedBatchLabel(line);
  }
  return test === null ? null : `Essai ${test.messageId}`;
}
