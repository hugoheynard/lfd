import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { MailBacklogReader } from "../domain/ports/mail-backlog.reader.js";
import type { MailBacklog, MailBacklogCriteria } from "../domain/services/mail-backlog.js";

/**
 * La veille du courrier, comptée dans `mail.mail_request` par les index
 * `(status, requested_at)` et `(status, last_attempt_at)`.
 *
 * Un échec est **définitif** quand le balayeur ne le reprendra plus : sans
 * tentative différée (un `sendAndAwaitReceipt`, que personne ne relance), hors
 * de la fenêtre de reprise, ou au plafond d'essais — la négation exacte de
 * `MailRequest.canResume`.
 */
@Injectable()
export class PrismaMailBacklogReader extends MailBacklogReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(criteria: MailBacklogCriteria): Promise<MailBacklog> {
    const stalledWhere = {
      status: { in: ["requested", "sending"] },
      requestedAt: { lt: criteria.stalledBefore },
    };
    const [stalled, oldest, definitiveFailures] = await Promise.all([
      this.prisma.mailRequest.count({ where: stalledWhere }),
      this.prisma.mailRequest.findFirst({
        where: stalledWhere,
        orderBy: { requestedAt: "asc" },
        select: { requestedAt: true },
      }),
      this.prisma.mailRequest.count({
        where: {
          status: "failed",
          failedAt: { gte: criteria.failedSince },
          OR: [
            { firstAttemptAt: null },
            { firstAttemptAt: { lt: criteria.resumableSince } },
            { attempts: { gte: criteria.maxAttempts } },
          ],
        },
      }),
    ]);
    return { stalled, oldestStalledAt: oldest?.requestedAt ?? null, definitiveFailures };
  }
}
