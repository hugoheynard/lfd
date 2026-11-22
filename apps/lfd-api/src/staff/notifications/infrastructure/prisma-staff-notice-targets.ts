import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { NoticeTargets } from "../domain/notice-audience/staff-notice-audience.js";
import { StaffNoticeTargetsReader } from "../domain/notice-audience/staff-notice-audience.ports.js";

/** Les rôles et les fiches qu'un réglage cite, lus en deux requêtes bornées par les ids. */
@Injectable()
export class PrismaStaffNoticeTargetsReader extends StaffNoticeTargetsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async targetsOf(
    roleKeys: readonly string[],
    staffUserIds: readonly string[],
  ): Promise<NoticeTargets> {
    const [roles, members] = await Promise.all([
      this.prisma.staffRoleDefinition.findMany({
        where: { key: { in: [...new Set(roleKeys)] } },
        select: { key: true, label: true, archivedAt: true },
      }),
      this.prisma.staffUser.findMany({
        where: { id: { in: [...new Set(staffUserIds)] } },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);
    return {
      roles: new Map(
        roles.map((role) => [role.key, { label: role.label, archived: role.archivedAt !== null }]),
      ),
      members: new Map(
        members.map((member) => [member.id, `${member.firstName} ${member.lastName}`.trim()]),
      ),
    };
  }
}
