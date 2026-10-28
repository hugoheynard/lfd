import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { RecentEmailRepliesReader } from "../domain/ports/recent-email-replies.reader.js";

/**
 * Adaptateur Prisma : les réponses par e-mail d'une adresse depuis un
 * instant. L'adresse est rangée normalisée (minuscules, `EmailAddress`) :
 * l'égalité suffit, sans `ILIKE` (cf. `findAccountByEmail` et ses `_`).
 */
@Injectable()
export class PrismaRecentEmailRepliesReader extends RecentEmailRepliesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async countFromSince(email: string, since: Date): Promise<number> {
    return this.prisma.customerRequest.count({
      where: { kind: "email_reply", authorEmail: email, receivedAt: { gte: since } },
    });
  }
}
