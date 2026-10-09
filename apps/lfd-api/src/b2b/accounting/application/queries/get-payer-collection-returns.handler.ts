import type { CollectionReturnView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CollectionReturnsReader } from "../../domain/ports/collection-returns.reader.js";
import { MandateRecheckReader } from "../../domain/ports/mandate-recheck.reader.js";
import { ReturnableLinesReader } from "../../domain/ports/returnable-lines.reader.js";
import { returnViews } from "../collection-return-view-support.js";
import { GetPayerCollectionReturnsQuery } from "./collection-return-queries.js";

/**
 * **Les retours d'un payeur** — la fiche client dit « Prélèvement rejeté le
 * … (motif) » (plan `retours-bancaires.md`). Le payeur est la
 * société DÉBITÉE par la ligne (`debtor_company_id`), pas le site qui a
 * commandé.
 */
@QueryHandler(GetPayerCollectionReturnsQuery)
export class GetPayerCollectionReturnsHandler implements IQueryHandler<
  GetPayerCollectionReturnsQuery,
  readonly CollectionReturnView[]
> {
  constructor(
    private readonly returns: CollectionReturnsReader,
    private readonly lines: ReturnableLinesReader,
    private readonly mandates: MandateRecheckReader,
  ) {}

  async execute(query: GetPayerCollectionReturnsQuery): Promise<readonly CollectionReturnView[]> {
    const rows = await this.returns.ofPayer(query.companyId);
    return returnViews({ lines: this.lines, mandates: this.mandates }, rows);
  }
}
