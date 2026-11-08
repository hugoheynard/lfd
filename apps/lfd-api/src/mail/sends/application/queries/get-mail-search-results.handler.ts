import type { MailRecipientSearchView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { isRevealCurrent, revealedUntil } from "../../domain/entities/staff-mail-consultations.js";
import {
  MailSearchNotFoundError,
  MailSearchNotReadableError,
} from "../../domain/errors/mail-sends.errors.js";
import { MailSearchLedger } from "../../domain/ports/mail-search.ledger.js";
import { MailSendReader } from "../../domain/ports/mail-send.reader.js";
import { toMailSendListItem } from "../mail-send-views.js";
import { GetMailSearchResultsQuery } from "./get-mail-search-results.query.js";

/**
 * Relit la recherche rangée, puis ses envois — figés à l'instant de la
 * recherche (cf. `SearchMailByRecipientHandler`) — dans l'ordre de la liste.
 * Un autre que l'auteur, ou l'auteur après 5 minutes : 403, et les envois ne
 * sont même pas lus.
 */
@QueryHandler(GetMailSearchResultsQuery)
export class GetMailSearchResultsHandler implements IQueryHandler<
  GetMailSearchResultsQuery,
  MailRecipientSearchView
> {
  constructor(
    private readonly searches: MailSearchLedger,
    private readonly sends: MailSendReader,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {MailSearchNotFoundError} la recherche n'existe pas.
   * @throws {MailSearchNotReadableError} un autre que l'auteur, ou plus de 5 minutes.
   */
  async execute({
    searchId,
    staffUserId,
  }: GetMailSearchResultsQuery): Promise<MailRecipientSearchView> {
    const search = await this.searches.searchOf(searchId);
    if (search === null) {
      throw new MailSearchNotFoundError(searchId);
    }
    if (search.staffId !== staffUserId || !isRevealCurrent(search.at, this.clock.now())) {
      throw new MailSearchNotReadableError(searchId);
    }
    const records = await this.sends.byIds(search.sendIds);
    return {
      id: search.id,
      searchedAt: search.at.toISOString(),
      readableUntil: revealedUntil(search.at).toISOString(),
      items: records.map(toMailSendListItem),
    };
  }
}
