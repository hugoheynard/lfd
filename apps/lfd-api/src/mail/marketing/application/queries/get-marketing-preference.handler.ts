import type { MailPreferenceDetailView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { MarketingPreferenceNotFoundError } from "../../domain/errors/marketing-preference-admin.errors.js";
import { MarketingPreferenceAdminReader } from "../../domain/ports/marketing-preference-admin.reader.js";
import { toPreferenceDetail } from "../marketing-preference-admin-views.js";
import { GetMarketingPreferenceQuery } from "./get-marketing-preference.query.js";

/** Le détail d'une ligne : son état, son origine, sa preuve — jamais l'adresse en clair. */
@QueryHandler(GetMarketingPreferenceQuery)
export class GetMarketingPreferenceHandler implements IQueryHandler<
  GetMarketingPreferenceQuery,
  MailPreferenceDetailView
> {
  constructor(private readonly preferences: MarketingPreferenceAdminReader) {}

  /** @throws {MarketingPreferenceNotFoundError} la ligne n'est pas au registre. */
  async execute({ preferenceId }: GetMarketingPreferenceQuery): Promise<MailPreferenceDetailView> {
    const state = await this.preferences.detail(preferenceId);
    if (state === null) {
      throw new MarketingPreferenceNotFoundError(preferenceId);
    }
    return toPreferenceDetail(state);
  }
}
