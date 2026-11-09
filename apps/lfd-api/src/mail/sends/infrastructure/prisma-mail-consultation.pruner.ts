import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { PurgeCensus } from "../../../platform/retention/purge-mode.js";
import { MailConsultationPruner } from "../domain/ports/mail-consultation.pruner.js";

/**
 * La purge des consultations du suivi : `mail_recipient_reveal`, puis
 * `mail_recipient_search`, puis celles du registre de préférence
 * (`mail_preference_consultation`, C4), plus vieilles que la frontière (1 an).
 *
 * Une suppression PHYSIQUE, admise comme celle du suivi : ces tables ne sont
 * pas un agrégat métier, elles décident d'un accès de 5 minutes et portent
 * l'identifiant d'une personne du staff ; la trace durable est au journal.
 * Elle ne s'exécute qu'en mode `on` (`MAIL_REQUEST_PURGE`). Les révélations
 * d'abord ; un lot entamé sur elles se complète sur les recherches.
 */
@Injectable()
export class PrismaMailConsultationPruner extends MailConsultationPruner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async census(cutoff: Date): Promise<PurgeCensus> {
    const [reveals, searches, registry, oldestReveal, oldestSearch, oldestRegistry] =
      await Promise.all([
        this.prisma.mailRecipientReveal.count({ where: { revealedAt: { lt: cutoff } } }),
        this.prisma.mailRecipientSearch.count({ where: { searchedAt: { lt: cutoff } } }),
        this.prisma.mailPreferenceConsultation.count({ where: { consultedAt: { lt: cutoff } } }),
        this.prisma.mailRecipientReveal.aggregate({
          where: { revealedAt: { lt: cutoff } },
          _min: { revealedAt: true },
        }),
        this.prisma.mailRecipientSearch.aggregate({
          where: { searchedAt: { lt: cutoff } },
          _min: { searchedAt: true },
        }),
        this.prisma.mailPreferenceConsultation.aggregate({
          where: { consultedAt: { lt: cutoff } },
          _min: { consultedAt: true },
        }),
      ]);
    return {
      count: reveals + searches + registry,
      oldest: earliest(
        earliest(oldestReveal._min.revealedAt, oldestSearch._min.searchedAt),
        oldestRegistry._min.consultedAt,
      ),
    };
  }

  async pruneBatch(cutoff: Date, limit: number): Promise<number> {
    const reveals = await this.prisma.$executeRaw`
      DELETE FROM "mail"."mail_recipient_reveal" WHERE "id" IN (
        SELECT "id" FROM "mail"."mail_recipient_reveal"
         WHERE "revealed_at" < ${cutoff} ORDER BY "revealed_at" LIMIT ${limit})`;
    if (reveals >= limit) {
      return reveals;
    }
    const searches = await this.prisma.$executeRaw`
      DELETE FROM "mail"."mail_recipient_search" WHERE "id" IN (
        SELECT "id" FROM "mail"."mail_recipient_search"
         WHERE "searched_at" < ${cutoff} ORDER BY "searched_at" LIMIT ${limit - reveals})`;
    if (reveals + searches >= limit) {
      return reveals + searches;
    }
    // Les consultations du registre de préférence (C4) ; leurs lignes
    // trouvées partent avec elles (ON DELETE CASCADE).
    const registry = await this.prisma.$executeRaw`
      DELETE FROM "mail"."mail_preference_consultation" WHERE "id" IN (
        SELECT "id" FROM "mail"."mail_preference_consultation"
         WHERE "consulted_at" < ${cutoff} ORDER BY "consulted_at" LIMIT ${limit - reveals - searches})`;
    return reveals + searches + registry;
  }
}

function earliest(left: Date | null, right: Date | null): Date | null {
  if (left === null) return right;
  if (right === null) return left;
  return left < right ? left : right;
}
