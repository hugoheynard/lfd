import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { MercurialeDraftView } from "@lfd/contracts";

import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { MercurialeDraftStore } from "../ports/mercuriale-draft.store.js";
import { ReadMercurialeDraftQuery } from "./read-mercuriale-draft.query.js";

/**
 * Le brouillon d'un client, avec le NOM de qui l'a touché en dernier — une
 * négociation se reprend souvent à deux (plan `plan-l-auteur-est-la-fiche.md`,
 * D3).
 */
@QueryHandler(ReadMercurialeDraftQuery)
export class ReadMercurialeDraftHandler implements IQueryHandler<
  ReadMercurialeDraftQuery,
  MercurialeDraftView | null
> {
  constructor(
    private readonly drafts: MercurialeDraftStore,
    private readonly staffAuthors: StaffAuthorDirectory,
  ) {}

  async execute(query: ReadMercurialeDraftQuery): Promise<MercurialeDraftView | null> {
    const draft = await this.drafts.forCompany(query.companyId);
    if (draft === null) {
      return null;
    }
    const authors = await this.staffAuthors.identify([draft.updatedBy]);
    return { ...draft, updatedByName: authors.nameOf(draft.updatedBy) };
  }
}
