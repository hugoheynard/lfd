import type { StaffNotificationsSummary } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { StaffAuthorDirectory } from "../../../directory/domain/staff-author-directory.js";
import { AudienceNotificationReader } from "../../domain/ports/staff-notifier.js";
import { GetMyNotificationsQuery } from "./get-my-notifications.query.js";

/** Comme la cloche partagée : au-delà, on ne lit plus, on subit. */
const RECENT_LIMIT = 30;

/**
 * **Mes notifications** (`plan-a-la-porte.md`, B5) — le compteur et les
 * dernières, sous le mur de mes droits. Le contrat est celui de la cloche
 * partagée (`StaffNotificationsSummary`) : une notice d'audience se lit en
 * commun par son audience, `readByName` y garde son sens.
 */
@QueryHandler(GetMyNotificationsQuery)
export class GetMyNotificationsHandler implements IQueryHandler<
  GetMyNotificationsQuery,
  StaffNotificationsSummary
> {
  constructor(
    private readonly reader: AudienceNotificationReader,
    private readonly staffAuthors: StaffAuthorDirectory,
  ) {}

  async execute(query: GetMyNotificationsQuery): Promise<StaffNotificationsSummary> {
    const [unread, stored] = await Promise.all([
      this.reader.countUnread(query.permissions),
      this.reader.recent(query.permissions, RECENT_LIMIT),
    ]);
    const authors = await this.staffAuthors.identify(stored.map((entry) => entry.readBy));
    const notifications = stored.map((entry) => ({
      ...entry,
      readByName: authors.nameOf(entry.readBy),
    }));
    return { unread, notifications };
  }
}
