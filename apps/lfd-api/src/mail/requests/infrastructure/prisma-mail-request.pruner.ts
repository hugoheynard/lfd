import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { PurgeCensus } from "../../../platform/retention/purge-mode.js";
import { MailRequestPruner } from "../domain/ports/mail-request.pruner.js";

/**
 * La purge de `mail.mail_request`.
 *
 * Une suppression PHYSIQUE, admise ici : la table est le suivi technique des
 * envois, pas un agrégat métier, et elle porte l'adresse du destinataire —
 * une donnée personnelle dont Hugo a fixé la durée à un an (2026-11-06,
 * `plan-service-e-mails.md` § 7). Archiver la ligne garderait l'adresse. Aucune
 * table ne la référence (vérifié le 2026-11-06 : `mail.prisma` ne porte
 * qu'elle, sans relation). Elle ne s'exécute qu'en mode `on`
 * (`MAIL_REQUEST_PURGE`), que Hugo n'a PAS activé au 2026-11-06.
 *
 * La règle est celle de `isMailRequestPurgeable`. `requested_at < cutoff` ne
 * la change pas (une demande précède son issue) : il laisse l'index
 * `(status, requested_at)` borner la lecture.
 */
@Injectable()
export class PrismaMailRequestPruner extends MailRequestPruner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async census(cutoff: Date): Promise<PurgeCensus> {
    const where = settledBefore(cutoff);
    const [count, oldest] = await Promise.all([
      this.prisma.mailRequest.count({ where }),
      this.prisma.mailRequest.aggregate({ where, _min: { requestedAt: true } }),
    ]);
    return { count, oldest: oldest._min.requestedAt };
  }

  async pruneBatch(cutoff: Date, limit: number): Promise<number> {
    const where = settledBefore(cutoff);
    const stale = await this.prisma.mailRequest.findMany({
      where,
      select: { id: true },
      orderBy: { requestedAt: "asc" },
      take: limit,
    });
    if (stale.length === 0) {
      return 0;
    }
    const { count } = await this.prisma.mailRequest.deleteMany({
      where: { ...where, id: { in: stale.map((row) => row.id) } },
    });
    return count;
  }
}

function settledBefore(cutoff: Date) {
  return {
    requestedAt: { lt: cutoff },
    OR: [
      { status: "sent", sentAt: { lt: cutoff } },
      { status: { in: ["failed", "refused"] }, failedAt: { lt: cutoff } },
    ],
  };
}
