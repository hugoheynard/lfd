import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CancellingMemberReader } from "../domain/ports/cancelling-member.reader.js";

/**
 * Le mur pro de l'annulation par le client (C6.2, B2) : un rattachement
 * ACCEPTÉ sur cette société, et la société `active`, en une lecture. Le `where`
 * porte la société de la commande et la personne du `Principal` — jamais un id
 * reçu du corps.
 */
@Injectable()
export class PrismaCancellingMemberReader extends CancellingMemberReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async mayCancelFor(userId: string, companyId: string): Promise<boolean> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        companyId,
        acceptedAt: { not: null },
        company: { status: "active" },
      },
      select: { id: true },
    });
    return membership !== null;
  }
}
