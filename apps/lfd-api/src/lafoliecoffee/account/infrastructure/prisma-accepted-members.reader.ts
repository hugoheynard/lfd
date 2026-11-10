import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  AcceptedMembersReader,
  type AcceptedMember,
} from "../domain/ports/accepted-members.reader.js";
import type { CompanyRole } from "../domain/value-objects/company-role.js";

/** Les rattachements ACCEPTÉS (`accepted_at` non nul) d'une société, aux rôles demandés. */
@Injectable()
export class PrismaAcceptedMembersReader extends AcceptedMembersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async withRoles(
    companyId: string,
    roles: readonly CompanyRole[],
  ): Promise<readonly AcceptedMember[]> {
    if (roles.length === 0) {
      return [];
    }
    const rows = await this.prisma.membership.findMany({
      where: { companyId, role: { in: [...roles] }, acceptedAt: { not: null } },
      select: { userId: true, role: true, user: { select: { email: true } } },
      orderBy: { userId: "asc" },
    });
    return rows.map((row) => ({ userId: row.userId, email: row.user.email, role: row.role }));
  }
}
