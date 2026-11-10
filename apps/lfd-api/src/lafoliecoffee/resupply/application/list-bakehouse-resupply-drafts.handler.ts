import type { BakehouseResupplyDraftView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { BakehouseResupplyDraftSnapshot } from "../domain/bakehouse-resupply-draft.js";
import { BakehouseResupplyDraftReader } from "../domain/bakehouse-resupply-draft.reader.js";
import { ListBakehouseResupplyDraftsQuery } from "./list-bakehouse-resupply-drafts.query.js";

function viewOf(draft: BakehouseResupplyDraftSnapshot): BakehouseResupplyDraftView {
  return {
    id: draft.id,
    version: draft.version,
    siteId: draft.content.siteId,
    target: draft.content.target,
    name: draft.content.name,
    lines: draft.content.lines,
    savedByName: draft.updated.author.name,
    savedAt: draft.updated.at.toISOString(),
  };
}

/** La liste courte de la carte du fournil : les brouillons ouverts, le plus récent d'abord. */
@QueryHandler(ListBakehouseResupplyDraftsQuery)
export class ListBakehouseResupplyDraftsHandler implements IQueryHandler<
  ListBakehouseResupplyDraftsQuery,
  readonly BakehouseResupplyDraftView[]
> {
  constructor(private readonly reader: BakehouseResupplyDraftReader) {}

  async execute(): Promise<readonly BakehouseResupplyDraftView[]> {
    return (await this.reader.listOpen()).map(viewOf);
  }
}
