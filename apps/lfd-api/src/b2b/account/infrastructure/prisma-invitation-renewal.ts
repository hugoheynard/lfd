import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { InvitationRenewal } from "../domain/ports/invitation-renewal.js";

/** Adaptateur Prisma du renouvellement d'une invitation. */
@Injectable()
export class PrismaInvitationRenewal extends InvitationRenewal {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async renew(userId: string, companyId: string | null, at: Date): Promise<string | null> {
    const target = await this.prisma.membership.findFirst({
      where: { userId, acceptedAt: null, ...(companyId === null ? {} : { companyId }) },
      orderBy: { invitedAt: "desc" },
      select: { id: true, companyId: true },
    });
    if (target === null) {
      return null;
    }
    // Conditionné à « toujours non accepté » : entrée entre-temps, la personne
    // n'a plus d'invitation à renouveler, et la date de son entrée fait foi.
    const { count } = await this.prisma.membership.updateMany({
      where: { id: target.id, acceptedAt: null },
      data: { invitedAt: at },
    });
    return count === 1 ? target.companyId : null;
  }
}
