import type { StaffPermission } from "@lfd/contracts";

import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../directory/domain/__tests__/fixed-staff-author-directory.js";
import {
  AudienceNotificationReader,
  type StoredStaffNotification,
} from "../../domain/ports/staff-notifier.js";
import { MarkMyNotificationReadCommand } from "../commands/mark-my-notification-read.command.js";
import { MarkMyNotificationReadHandler } from "../commands/mark-my-notification-read.handler.js";
import { GetMyNotificationsHandler } from "../queries/get-my-notifications.handler.js";
import { GetMyNotificationsQuery } from "../queries/get-my-notifications.query.js";

// Un instant recopié, jamais comparé à l'horloge.
const NOW = new Date(5_000);
const SALES: readonly StaffPermission[] = ["b2b_companies:read", "b2b_companies:write"];

/** Le lecteur des notices d'audience, en mémoire — il joue le mur `audience IN (…)`. */
class InMemoryAudienceNotices extends AudienceNotificationReader {
  readonly marked: { id: string | null; by: string; at: Date }[] = [];

  constructor(
    private readonly notices: readonly (StoredStaffNotification & {
      readonly audience: StaffPermission;
    })[],
  ) {
    super();
  }

  recent(audiences: readonly StaffPermission[], limit: number): Promise<StoredStaffNotification[]> {
    return Promise.resolve(
      this.mine(audiences)
        .slice(0, limit)
        .map(({ audience: _audience, ...stored }) => stored),
    );
  }

  countUnread(audiences: readonly StaffPermission[]): Promise<number> {
    return Promise.resolve(this.mine(audiences).filter((notice) => notice.readAt === null).length);
  }

  markRead(
    id: string,
    audiences: readonly StaffPermission[],
    staffUserId: string,
    at: Date,
  ): Promise<void> {
    if (this.mine(audiences).some((notice) => notice.id === id)) {
      this.marked.push({ id, by: staffUserId, at });
    }
    return Promise.resolve();
  }

  markAllRead(
    audiences: readonly StaffPermission[],
    staffUserId: string,
    at: Date,
  ): Promise<number> {
    const count = this.mine(audiences).length;
    if (count > 0) {
      this.marked.push({ id: null, by: staffUserId, at });
    }
    return Promise.resolve(count);
  }

  private mine(audiences: readonly StaffPermission[]) {
    return this.notices.filter((notice) => audiences.includes(notice.audience));
  }
}

const DECISION = {
  id: "n_1",
  kind: "delivery.stop_decision",
  subject: "Livraison à décider — commande CMD-1",
  body: "Kangoo, passage 1 : personne pour réceptionner.",
  link: "/livraison/a-decider",
  occurredAt: NOW.toISOString(),
  readAt: NOW.toISOString(),
  readBy: "staff_lea",
  audience: "b2b_companies:write",
} as const;

describe("mes notifications — adressées par droit (B5)", () => {
  it("rend celles de mes droits, avec le NOM de qui l'a lue dans l'audience", async () => {
    const handler = new GetMyNotificationsHandler(
      new InMemoryAudienceNotices([DECISION]),
      new FixedStaffAuthorDirectory(
        new Map(authorsKnownAs({ firstName: "Léa", lastName: "Martin" }, "staff_lea")),
      ),
    );

    const summary = await handler.execute(new GetMyNotificationsQuery(SALES));

    expect(summary.unread).toBe(0);
    expect(summary.notifications).toEqual([
      expect.objectContaining({ id: "n_1", readByName: "Léa Martin" }),
    ]);
    expect(summary.notifications[0]).not.toHaveProperty("audience");
  });

  it("🔴 un livreur, sans le droit visé, ne voit rien", async () => {
    const handler = new GetMyNotificationsHandler(
      new InMemoryAudienceNotices([DECISION]),
      new FixedStaffAuthorDirectory(),
    );

    const summary = await handler.execute(
      new GetMyNotificationsQuery(["delivery_driving:read", "delivery_driving:write"]),
    );

    expect(summary).toEqual({ unread: 0, notifications: [] });
  });

  it("🔴 marquer lue par son id une notice hors de mes droits ne touche rien", async () => {
    const notices = new InMemoryAudienceNotices([DECISION]);
    const handler = new MarkMyNotificationReadHandler(notices, new FixedClock(NOW));

    await handler.execute(
      new MarkMyNotificationReadCommand("n_1", ["delivery_driving:write"], "staff_paul"),
    );
    await handler.execute(
      new MarkMyNotificationReadCommand(null, ["delivery_driving:write"], "staff_paul"),
    );

    expect(notices.marked).toEqual([]);
  });

  it("marque lue, une ou toutes, à l'heure du `Clock`", async () => {
    const notices = new InMemoryAudienceNotices([DECISION]);
    const handler = new MarkMyNotificationReadHandler(notices, new FixedClock(NOW));

    await handler.execute(new MarkMyNotificationReadCommand("n_1", SALES, "staff_lea"));
    await handler.execute(new MarkMyNotificationReadCommand(null, SALES, "staff_lea"));

    expect(notices.marked).toEqual([
      { id: "n_1", by: "staff_lea", at: NOW },
      { id: null, by: "staff_lea", at: NOW },
    ]);
  });
});
