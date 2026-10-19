import type { VitrineNoticeView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { VitrineNoticeReader } from "../../domain/ports/vitrine-notice.reader.js";
import { ListVitrineNoticesQuery } from "./list-vitrine-notices.query.js";

/** Combien d'annonces l'écran montre : les dernières, pas l'archive. */
export const VITRINE_NOTICES_SHOWN = 20;

/**
 * Les dernières annonces, de la plus récente à la plus ancienne, l'auteur
 * nommé par l'annuaire du staff (comme les liens de paiement) — en une
 * lecture pour toute la liste. Un id qui ne désigne plus personne rend
 * `null` : l'écran montre l'id, jamais un nom inventé.
 */
@QueryHandler(ListVitrineNoticesQuery)
export class ListVitrineNoticesHandler implements IQueryHandler<
  ListVitrineNoticesQuery,
  readonly VitrineNoticeView[]
> {
  constructor(
    private readonly reader: VitrineNoticeReader,
    private readonly authors: StaffAuthorDirectory,
  ) {}

  async execute(): Promise<readonly VitrineNoticeView[]> {
    const entries = await this.reader.recent(VITRINE_NOTICES_SHOWN);
    const authors = await this.authors.identify(entries.map((entry) => entry.authorStaffId));
    return entries.map((entry) => ({ ...entry, authorName: authors.nameOf(entry.authorStaffId) }));
  }
}
