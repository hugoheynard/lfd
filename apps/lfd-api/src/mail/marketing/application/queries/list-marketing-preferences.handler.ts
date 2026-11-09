import type { MailPreferenceListView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { MarketingPreferenceAdminReader } from "../../domain/ports/marketing-preference-admin.reader.js";
import { toPreferenceListItem } from "../marketing-preference-admin-views.js";
import { ListMarketingPreferencesQuery } from "./list-marketing-preferences.query.js";

/**
 * Lit une page du registre, les lignes les plus récentes d'abord. Le curseur
 * est l'identifiant de la dernière ligne servie (un ULID, triable par le
 * temps). Une ligne de plus que la page est lue : elle dit s'il en reste,
 * sans compter.
 */
@QueryHandler(ListMarketingPreferencesQuery)
export class ListMarketingPreferencesHandler implements IQueryHandler<
  ListMarketingPreferencesQuery,
  MailPreferenceListView
> {
  constructor(private readonly preferences: MarketingPreferenceAdminReader) {}

  async execute({ criteria }: ListMarketingPreferencesQuery): Promise<MailPreferenceListView> {
    const rows = await this.preferences.page(
      { space: criteria.space, status: criteria.status },
      criteria.cursor,
      criteria.limit + 1,
    );
    const page = rows.slice(0, criteria.limit);
    const last = page.at(-1);
    return {
      items: page.map(toPreferenceListItem),
      nextCursor: rows.length > criteria.limit && last !== undefined ? last.id : null,
    };
  }
}
