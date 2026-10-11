import type { ActivityPageView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ActivityJournalReader } from "../../../growth/domain/ports/activity-journal.reader.js";
import { SHOP_COPY_FACTS, SHOP_COPY_SUBJECT } from "../../domain/shop-copy.events.js";
import { GetShopCopyHistoryQuery } from "./get-shop-copy-history.query.js";

/**
 * L'historique des publications : le journal, borné au sujet des textes.
 *
 * Le journal est la seule mémoire de ce que la boutique disait avant — les
 * lignes, elles, ne gardent que le publié courant. Lu par le port de lecture
 * du journal, sous le droit de la vitrine : l'écran des textes n'a pas à
 * demander l'accès au journal entier pour relire ses propres publications.
 */
@QueryHandler(GetShopCopyHistoryQuery)
export class GetShopCopyHistoryHandler implements IQueryHandler<
  GetShopCopyHistoryQuery,
  ActivityPageView
> {
  constructor(private readonly journal: ActivityJournalReader) {}

  execute(query: GetShopCopyHistoryQuery): Promise<ActivityPageView> {
    return this.journal.page(
      {
        type: SHOP_COPY_FACTS.published,
        subjectType: "shop_copy",
        subjectId: SHOP_COPY_SUBJECT,
        page: query.filters.page,
        limit: query.filters.limit,
      },
      null,
      null,
    );
  }
}
