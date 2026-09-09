import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { MercurialeDraftView } from "@lfd/contracts";

import { MercurialeDraftStore } from "../ports/mercuriale-draft.store.js";
import { ReadMercurialeDraftQuery } from "./read-mercuriale-draft.query.js";

@QueryHandler(ReadMercurialeDraftQuery)
export class ReadMercurialeDraftHandler implements IQueryHandler<
  ReadMercurialeDraftQuery,
  MercurialeDraftView | null
> {
  constructor(private readonly drafts: MercurialeDraftStore) {}

  execute(query: ReadMercurialeDraftQuery): Promise<MercurialeDraftView | null> {
    return this.drafts.forCompany(query.companyId);
  }
}
