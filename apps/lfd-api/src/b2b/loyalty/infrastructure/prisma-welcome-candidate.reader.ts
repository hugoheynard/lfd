import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  WelcomeCandidateReader,
  type WelcomeCandidateFacts,
  type WelcomeCandidatePage,
} from "../domain/ports/welcome-candidate.reader.js";

/**
 * Les personnes vues par le bonus, lues dans la table des comptes — celle du
 * même bloc (`b2b`), lue et jamais écrite. Ni l'adresse, ni le nom : deux
 * instants et un booléen.
 */
@Injectable()
export class PrismaWelcomeCandidateReader extends WelcomeCandidateReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async candidate(userId: string): Promise<WelcomeCandidateFacts | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, becameAccountAt: true, emailVerified: true },
    });
    return user === null
      ? null
      : {
          userId: user.id,
          becameAccountAt: user.becameAccountAt,
          addressProven: user.emailVerified,
        };
  }

  async listPending(
    since: Date,
    after: string | null,
    limit: number,
  ): Promise<WelcomeCandidatePage> {
    // Un de plus que le lot : savoir s'il en reste sans seconde requête.
    const rows = await this.prisma.user.findMany({
      where: {
        becameAccountAt: { gte: since },
        emailVerified: true,
        loyaltyEntries: { none: { kind: "welcome" } },
        ...(after === null ? {} : { id: { gt: after } }),
      },
      orderBy: { id: "asc" },
      take: limit + 1,
      select: { id: true },
    });
    const page = rows.slice(0, limit).map((row) => row.id);
    const last = page.at(-1);
    return { userIds: page, nextAfter: rows.length > limit && last !== undefined ? last : null };
  }
}
