import type { MailSendListView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { InvalidMailSendPeriodError } from "../../domain/errors/mail-sends.errors.js";
import { MailProbeTemplates } from "../../domain/ports/mail-probe-templates.js";
import { type MailSendFilter, MailSendReader } from "../../domain/ports/mail-send.reader.js";
import { problemRankOf, storedStatusOf } from "../../domain/services/mail-send-state.js";
import { decodeMailSendCursor, encodeMailSendCursor } from "../mail-send-cursor.js";
import { toMailSendListItem } from "../mail-send-views.js";
import { type MailSendCriteria, ListMailSendsQuery } from "./list-mail-sends.query.js";

/**
 * Lit une page du suivi. La sonde (`outOfEditor`) n'est listée que sur
 * demande explicite (`scope = probes`), et alors seule (décision 10) : elle
 * ne remonte jamais parmi les problèmes ordinaires.
 *
 * Une ligne de plus que la page est lue : elle dit s'il en reste, sans compter.
 */
@QueryHandler(ListMailSendsQuery)
export class ListMailSendsHandler implements IQueryHandler<ListMailSendsQuery, MailSendListView> {
  constructor(
    private readonly sends: MailSendReader,
    private readonly probes: MailProbeTemplates,
  ) {}

  /**
   * @throws {InvalidMailSendCursorError} le curseur n'a pas été rendu par la liste.
   * @throws {InvalidMailSendPeriodError} la période commence après sa fin.
   */
  async execute({ criteria }: ListMailSendsQuery): Promise<MailSendListView> {
    const after = criteria.cursor === null ? null : decodeMailSendCursor(criteria.cursor);
    const rows = await this.sends.page(this.filterOf(criteria), after, criteria.limit + 1);
    const page = rows.slice(0, criteria.limit);
    const last = page.at(-1);
    const nextCursor =
      rows.length > criteria.limit && last !== undefined
        ? encodeMailSendCursor({
            rank: problemRankOf(last.status, last.delivery),
            requestedAt: last.requestedAt,
            id: last.id,
          })
        : null;
    return { items: page.map(toMailSendListItem), nextCursor };
  }

  private filterOf(criteria: MailSendCriteria): MailSendFilter {
    if (criteria.from !== null && criteria.to !== null && criteria.from > criteria.to) {
      throw new InvalidMailSendPeriodError();
    }
    const probes = this.probes.keys();
    return {
      space: criteria.space,
      template: criteria.template,
      status: criteria.state === null ? null : storedStatusOf(criteria.state),
      delivery: criteria.delivery,
      from: criteria.from,
      to: criteria.to,
      onlyTemplates: criteria.scope === "probes" ? probes : null,
      exceptTemplates: criteria.scope === "probes" ? [] : probes,
    };
  }
}
