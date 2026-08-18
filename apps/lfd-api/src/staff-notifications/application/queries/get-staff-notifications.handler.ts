import type { StaffNotificationsSummary } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { StaffNotificationReader } from "../../domain/ports/staff-notifier.js";
import { GetStaffNotificationsQuery } from "./get-staff-notifications.query.js";

/** Le compteur **et** la liste en une lecture : la cloche affiche les deux. */
@QueryHandler(GetStaffNotificationsQuery)
export class GetStaffNotificationsHandler implements IQueryHandler<
  GetStaffNotificationsQuery,
  StaffNotificationsSummary
> {
  constructor(private readonly reader: StaffNotificationReader) {}

  async execute(): Promise<StaffNotificationsSummary> {
    const [unread, notifications] = await Promise.all([
      this.reader.countUnread(),
      this.reader.recent(RECENT_LIMIT),
    ]);
    return { unread, notifications };
  }
}

/**
 * Une cloche n'est pas un journal : au-delà, on ne lit plus, on subit. Les faits
 * anciens restent en base — c'est l'écran ciblé qui porte l'historique complet.
 */
const RECENT_LIMIT = 30;
