import type { StaffNotificationView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { IdGenerator } from "../../infra/id/id-generator.js";
import { PrismaService } from "../../infra/database/prisma.service.js";
import {
  StaffNotificationReader,
  StaffNotifier,
  type StaffNotice,
} from "../domain/ports/staff-notifier.js";

/** Une ligne `staff_notifications`, vue d'ici seulement. */
interface NotificationRow {
  readonly id: string;
  readonly kind: string;
  readonly subject: string;
  readonly body: string;
  readonly link: string;
  readonly occurredAt: Date;
  readonly readAt: Date | null;
  readonly readBy: string | null;
}

/**
 * Émission — idempotente par la **contrainte unique**, pas par un « existe-t-il
 * déjà ? » applicatif que deux émissions concurrentes gagneraient toutes les deux.
 */
@Injectable()
export class PrismaStaffNotifier extends StaffNotifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async notify(notices: readonly StaffNotice[]): Promise<void> {
    if (notices.length === 0) {
      return;
    }
    await this.prisma.staffNotification.createMany({
      data: notices.map((notice) => ({ id: this.ids.next(), ...notice })),
      skipDuplicates: true,
    });
  }
}

/** Lecture et marquage — l'autre moitié du port, séparée exprès (ISP). */
@Injectable()
export class PrismaStaffNotificationReader extends StaffNotificationReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async recent(limit: number): Promise<StaffNotificationView[]> {
    const rows = await this.prisma.staffNotification.findMany({
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
    return rows.map((row) => toView(row));
  }

  async countUnread(): Promise<number> {
    return this.prisma.staffNotification.count({ where: { readAt: null } });
  }

  /** `updateMany` avec `readAt: null` : le premier lecteur fait foi. */
  async markRead(id: string, staffSub: string, at: Date): Promise<void> {
    await this.prisma.staffNotification.updateMany({
      where: { id, readAt: null },
      data: { readAt: at, readBy: staffSub },
    });
  }

  async markAllRead(staffSub: string, at: Date): Promise<number> {
    const marked = await this.prisma.staffNotification.updateMany({
      where: { readAt: null },
      data: { readAt: at, readBy: staffSub },
    });
    return marked.count;
  }
}

function toView(row: NotificationRow): StaffNotificationView {
  return {
    id: row.id,
    kind: row.kind,
    subject: row.subject,
    body: row.body,
    link: row.link,
    occurredAt: row.occurredAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    readBy: row.readBy,
  };
}
