import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { MailRequest } from "../domain/entities/mail-request.js";
import {
  type StalledMailCriteria,
  StalledMailRequests,
} from "../domain/ports/stalled-mail-requests.js";
import { toDomain, WITH_SUBJECTS } from "./prisma-mail-request.repository.js";

/**
 * Les envois différés en retard, lus par l'index `(status, last_attempt_at)`.
 * Un échec de `sendAndAwaitReceipt` n'a pas de première tentative différée : le filtre
 * `first_attempt_at >= …` l'écarte, comme l'agrégat (`canResume`).
 */
@Injectable()
export class PrismaStalledMailRequests extends StalledMailRequests {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async due(criteria: StalledMailCriteria): Promise<readonly MailRequest[]> {
    const late = { lastAttemptAt: { lt: criteria.attemptedBefore } };
    const rows = await this.prisma.mailRequest.findMany({
      where: {
        OR: [
          { status: "sending", ...late },
          {
            status: "failed",
            ...late,
            firstAttemptAt: { gte: criteria.firstAttemptSince },
            attempts: { lt: criteria.maxAttempts },
          },
        ],
      },
      orderBy: [{ lastAttemptAt: "asc" }, { id: "asc" }],
      take: criteria.limit,
      // Les sujets avec la demande : relancée, elle peut relire un rebond déjà
      // rangé (`MailOutcomeRecorder`), et le fait d'échec doit les porter
      // (`plan-sujet-des-e-mails.md`, E4).
      include: WITH_SUBJECTS,
    });
    return rows.map(toDomain);
  }
}
