import type { MailPreferenceSearchView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import {
  isRevealCurrent,
  revealedUntil,
} from "../../../sends/domain/entities/staff-mail-consultations.js";
import {
  MarketingPreferenceSearchNotFoundError,
  MarketingPreferenceSearchNotReadableError,
} from "../../domain/errors/marketing-preference-admin.errors.js";
import { MarketingPreferenceAdminReader } from "../../domain/ports/marketing-preference-admin.reader.js";
import { PreferenceConsultationLedger } from "../../domain/ports/preference-consultation.ledger.js";
import { toPreferenceListItem } from "../marketing-preference-admin-views.js";
import { GetMarketingPreferenceSearchQuery } from "./get-marketing-preference-search.query.js";

/**
 * Relit une recherche du registre : les lignes figées à son instant, adresse
 * masquée. Lisible par son seul auteur, pendant 5 minutes — la fenêtre d'une
 * révélation.
 */
@QueryHandler(GetMarketingPreferenceSearchQuery)
export class GetMarketingPreferenceSearchHandler implements IQueryHandler<
  GetMarketingPreferenceSearchQuery,
  MailPreferenceSearchView
> {
  constructor(
    private readonly consultations: PreferenceConsultationLedger,
    private readonly preferences: MarketingPreferenceAdminReader,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {MarketingPreferenceSearchNotFoundError} la recherche n'existe pas.
   * @throws {MarketingPreferenceSearchNotReadableError} hors de son auteur, ou après 5 minutes.
   */
  async execute({
    searchId,
    staffUserId,
  }: GetMarketingPreferenceSearchQuery): Promise<MailPreferenceSearchView> {
    const search = await this.consultations.searchOf(searchId);
    if (search === null) {
      throw new MarketingPreferenceSearchNotFoundError(searchId);
    }
    if (search.staffId !== staffUserId || !isRevealCurrent(search.at, this.clock.now())) {
      throw new MarketingPreferenceSearchNotReadableError(searchId);
    }
    const rows = await this.preferences.byIds(search.preferenceIds);
    return {
      id: search.id,
      searchedAt: search.at.toISOString(),
      readableUntil: revealedUntil(search.at).toISOString(),
      items: rows.map(toPreferenceListItem),
    };
  }
}
