import type { StaffPermission } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  AudienceNotificationReader,
  type StoredStaffNotification,
} from "../domain/ports/staff-notifier.js";
import { toView } from "./prisma-staff-notifications.js";

/**
 * 🔴 **Le mur de « mes notifications »** (`a-la-porte.md`, B5) — dans
 * CHAQUE `where` : `audience IN (mes droits)`. Une liste vide ne lit rien et
 * ne marque rien — `IN ()` le dit déjà, la garde explicite évite la requête.
 * Une notice du fil partagé (`audience` nulle) n'y entre jamais : `IN` ne
 * retient pas `NULL`.
 */
function mine(audiences: readonly StaffPermission[]): { readonly audience: { in: string[] } } {
  return { audience: { in: [...audiences] } };
}

/** Lecture et marquage des notices adressées par droit. */
@Injectable()
export class PrismaAudienceNotificationReader extends AudienceNotificationReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async recent(
    audiences: readonly StaffPermission[],
    limit: number,
  ): Promise<StoredStaffNotification[]> {
    if (audiences.length === 0) {
      return [];
    }
    const rows = await this.prisma.staffNotification.findMany({
      where: mine(audiences),
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
    return rows.map((row) => toView(row));
  }

  async countUnread(audiences: readonly StaffPermission[]): Promise<number> {
    if (audiences.length === 0) {
      return 0;
    }
    return this.prisma.staffNotification.count({ where: { ...mine(audiences), readAt: null } });
  }

  /** `readAt: null` : le premier lecteur de l'audience fait foi. */
  async markRead(
    id: string,
    audiences: readonly StaffPermission[],
    staffUserId: string,
    at: Date,
  ): Promise<void> {
    if (audiences.length === 0) {
      return;
    }
    await this.prisma.staffNotification.updateMany({
      where: { ...mine(audiences), id, readAt: null },
      data: { readAt: at, readBy: staffUserId },
    });
  }

  async markAllRead(
    audiences: readonly StaffPermission[],
    staffUserId: string,
    at: Date,
  ): Promise<number> {
    if (audiences.length === 0) {
      return 0;
    }
    const marked = await this.prisma.staffNotification.updateMany({
      where: { ...mine(audiences), readAt: null },
      data: { readAt: at, readBy: staffUserId },
    });
    return marked.count;
  }
}
