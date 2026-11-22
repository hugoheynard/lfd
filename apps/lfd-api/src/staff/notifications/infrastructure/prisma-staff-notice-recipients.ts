import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  type StaffNoticeRecipient,
  StaffNoticeRecipients,
} from "../domain/ports/staff-notice-recipients.js";

/** Le statut qui ferme toutes les portes — et la boîte aux lettres (`ReachableStaff`). */
const SUSPENDED = "suspended";

/**
 * Adaptateur de {@link StaffNoticeRecipients} : le réglage, puis les fiches
 * joignables qu'il désigne — par leur rôle ou par leur nom —, en une requête
 * qui dédoublonne et trie d'elle-même.
 */
@Injectable()
export class PrismaStaffNoticeRecipients extends StaffNoticeRecipients {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async recipientsOf(template: string): Promise<readonly StaffNoticeRecipient[]> {
    const rows = await this.prisma.staffNoticeAudience.findMany({
      where: { template },
      select: { roleKey: true, staffUserId: true },
    });
    const roleKeys = rows.flatMap((row) => (row.roleKey === null ? [] : [row.roleKey]));
    const ids = rows.flatMap((row) => (row.staffUserId === null ? [] : [row.staffUserId]));
    if (roleKeys.length + ids.length === 0) {
      return [];
    }
    const members = await this.prisma.staffUser.findMany({
      where: {
        status: { not: SUSPENDED },
        email: { not: "" },
        OR: [{ roleKey: { in: roleKeys } }, { id: { in: ids } }],
      },
      orderBy: { id: "asc" },
      select: { id: true, email: true },
    });
    return members.map((member) => ({ staffUserId: member.id, email: member.email }));
  }
}
