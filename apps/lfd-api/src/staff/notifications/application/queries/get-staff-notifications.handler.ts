import type { StaffNotificationsSummary } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { StaffAuthorDirectory } from "../../../directory/domain/staff-author-directory.js";
import { StaffNotificationReader } from "../../domain/ports/staff-notifier.js";
import { GetStaffNotificationsQuery } from "./get-staff-notifications.query.js";

/**
 * Le compteur **et** la liste en une lecture : la cloche affiche les deux —
 * avec le NOM de qui a lu chaque fait, jamais son identifiant (plan
 * `plan-l-auteur-est-la-fiche.md`, D3).
 */
@QueryHandler(GetStaffNotificationsQuery)
export class GetStaffNotificationsHandler implements IQueryHandler<
  GetStaffNotificationsQuery,
  StaffNotificationsSummary
> {
  constructor(
    private readonly reader: StaffNotificationReader,
    private readonly staffAuthors: StaffAuthorDirectory,
  ) {}

  async execute(): Promise<StaffNotificationsSummary> {
    const [unread, stored] = await Promise.all([
      this.reader.countUnread(),
      this.reader.recent(RECENT_LIMIT),
    ]);
    const authors = await this.staffAuthors.identify(stored.map((entry) => entry.readBy));
    const notifications = stored.map((entry) => ({
      ...entry,
      readByName: authors.nameOf(entry.readBy),
    }));
    return { unread, notifications };
  }
}

/**
 * Une cloche n'est pas un journal : au-delà, on ne lit plus, on subit. Les faits
 * anciens restent en base — c'est l'écran ciblé qui porte l'historique complet.
 */
const RECENT_LIMIT = 30;
