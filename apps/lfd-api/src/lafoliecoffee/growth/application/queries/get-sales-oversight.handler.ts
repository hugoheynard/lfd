import {
  SALES_OVERSIGHT_PAGE_SIZE,
  SALES_OVERSIGHT_UNASSIGNED,
  type SalesOversightQuery,
  type SalesOversightView,
} from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { MailSubjectDeliveries } from "../../../../mail/channels/deliveries/mail-subject-deliveries.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffContacts } from "../../../../staff/directory/domain/staff-contacts.js";
import type { SalesSheetScope } from "../../domain/ports/sales-sheet.reader.js";
import { SalesSheetReader } from "../../domain/ports/sales-sheet.reader.js";
import { readSalesSheet, selectSalesSheets } from "../../domain/sales-oversight.js";
import { GetSalesOversightQuery } from "./get-sales-oversight.query.js";
import { accessRequestsOf, followerOptionsOf, rowViewOf } from "./sales-oversight-view.js";

/**
 * La borne des fiches lues pour un filtre. Le niveau et les signaux se
 * calculent en mémoire sur TOUT le filtre (les compteurs en dépendent), et
 * le portefeuille en compte quelques centaines (plan § 3.3) : au-delà, la
 * lecture est refusée et l'écran invite à filtrer.
 */
export const SALES_OVERSIGHT_MAX_SHEETS = 1000;

/**
 * **Le suivi commercial** : les fiches principales du filtre, lues par lots
 * (base, envois de l'accès au bloc `mail`, noms à l'annuaire staff), puis
 * calculées, comptées et paginées par le domaine. Aucune lecture par ligne.
 */
@QueryHandler(GetSalesOversightQuery)
export class GetSalesOversightHandler implements IQueryHandler<
  GetSalesOversightQuery,
  SalesOversightView
> {
  constructor(
    private readonly sheets: SalesSheetReader,
    private readonly mails: MailSubjectDeliveries,
    private readonly staff: StaffContacts,
    private readonly clock: Clock,
  ) {}

  async execute({ filters }: GetSalesOversightQuery): Promise<SalesOversightView> {
    const [facts, followerIds] = await Promise.all([
      this.sheets.read(scopeOf(filters), SALES_OVERSIGHT_MAX_SHEETS),
      this.sheets.followerIds(),
    ]);
    const followed = facts.flatMap((fact) =>
      fact.followedByStaffId === null ? [] : [fact.followedByStaffId],
    );
    const [mails, staff] = await Promise.all([
      this.mails.forSubjects(
        "company",
        facts.map((fact) => fact.companyId),
      ),
      this.staff.contactsOf([...new Set([...followerIds, ...followed])]),
    ]);
    const now = this.clock.now();
    const sheets = facts.map((fact) =>
      readSalesSheet(fact, accessRequestsOf(mails.get(fact.companyId)), now),
    );
    const page = selectSalesSheets(sheets, {
      level: filters.level,
      signal: filters.signal,
      page: filters.page,
      pageSize: SALES_OVERSIGHT_PAGE_SIZE,
    });
    return {
      counts: page.counts,
      rows: page.rows.map((sheet) => rowViewOf(sheet, staff)),
      page: filters.page,
      pageSize: SALES_OVERSIGHT_PAGE_SIZE,
      total: page.total,
      followers: followerOptionsOf(followerIds, staff),
    };
  }
}

/** Ce que la base filtre : le commercial (ou aucun) et le canal. */
function scopeOf(filters: SalesOversightQuery): SalesSheetScope {
  const followedBy = filters.follower === SALES_OVERSIGHT_UNASSIGNED ? null : filters.follower;
  const channel =
    filters.channel === undefined ? undefined : filters.channel === "commercial" ? "staff" : "self";
  return { followedBy, channel };
}
