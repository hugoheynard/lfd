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
import { SalesDayReader, type SalesDayScope } from "../../domain/ports/sales-day.reader.js";
import type { SalesSheetScope } from "../../domain/ports/sales-sheet.reader.js";
import { SalesSheetReader } from "../../domain/ports/sales-sheet.reader.js";
import { readSalesSheet, selectSalesSheets } from "../../domain/sales-oversight.js";
import { parisDayOf } from "../../domain/sales-today.js";
import { GetSalesOversightQuery } from "./get-sales-oversight.query.js";
import { accessRequestsOf, followerOptionsOf, rowViewOf } from "./sales-oversight-view.js";
import { todayViewOf } from "./sales-today-view.js";

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
 *
 * Le récap du jour (jour civil de Paris) réutilise les fiches et les e-mails
 * déjà lus, et n'ajoute que les lectures du jour qui ne passent pas par le
 * suiveur : les ouvertures (par auteur) et les contacts (par qui les a notés).
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
    private readonly days: SalesDayReader,
    private readonly clock: Clock,
  ) {}

  async execute({ filters }: GetSalesOversightQuery): Promise<SalesOversightView> {
    const now = this.clock.now();
    const day = parisDayOf(now);
    const dayScope = dayScopeOf(filters);
    const [facts, followerIds, opened, contacts] = await Promise.all([
      this.sheets.read(scopeOf(filters), SALES_OVERSIGHT_MAX_SHEETS),
      this.sheets.followerIds(),
      this.days.openedOn(dayScope, day),
      this.days.contactsOn(dayScope, day),
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
      today: todayViewOf({ day, opened, contacts, sheets, mails }),
    };
  }
}

/** Le récap du jour : un commercial, ou toute l'équipe (« non attribuée » compris). */
function dayScopeOf(filters: SalesOversightQuery): SalesDayScope {
  const unassigned = filters.follower === SALES_OVERSIGHT_UNASSIGNED;
  return {
    actor: unassigned ? undefined : filters.follower,
    unassigned,
    channel: scopeOf(filters).channel,
  };
}

/** Ce que la base filtre : le commercial (ou aucun) et le canal. */
function scopeOf(filters: SalesOversightQuery): SalesSheetScope {
  const followedBy = filters.follower === SALES_OVERSIGHT_UNASSIGNED ? null : filters.follower;
  const channel =
    filters.channel === undefined ? undefined : filters.channel === "commercial" ? "staff" : "self";
  return { followedBy, channel };
}
