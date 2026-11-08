import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  consultationWindowStart,
  StaffMailConsultations,
} from "../domain/entities/staff-mail-consultations.js";
import { StaffMailConsultationsRepository } from "../domain/ports/staff-mail-consultations.repository.js";

interface WindowRow {
  readonly count: bigint;
  readonly oldest: Date | null;
}

/**
 * Les consultations d'une personne : révélations et recherches de la
 * dernière heure, comptées ENSEMBLE (le plafond est partagé, décision 8).
 *
 * `load` pose d'abord `pg_advisory_xact_lock` sur la personne, relâché au
 * `COMMIT` ou au `ROLLBACK` : deux révélations simultanées ne lisent pas le
 * même compte. Il doit donc être appelé sous une unité de travail.
 */
@Injectable()
export class PrismaStaffMailConsultationsRepository extends StaffMailConsultationsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(staffId: string, now: Date): Promise<StaffMailConsultations> {
    const key = `mail-consultations:${staffId}`;
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const since = consultationWindowStart(now);
    const [row] = await this.prisma.$queryRaw<readonly WindowRow[]>`
      SELECT count(*) AS "count", min(t."at") AS "oldest" FROM (
        SELECT "revealed_at" AS "at" FROM "mail"."mail_recipient_reveal"
         WHERE "revealed_by" = ${staffId} AND "revealed_at" > ${since}
        UNION ALL
        SELECT "searched_at" FROM "mail"."mail_recipient_search"
         WHERE "searched_by" = ${staffId} AND "searched_at" > ${since}
      ) t`;
    return StaffMailConsultations.of(staffId, Number(row?.count ?? 0n), row?.oldest ?? null);
  }

  /** Les révélations, puis les recherches et leurs envois trouvés — jamais une adresse. */
  async save(consultations: StaffMailConsultations): Promise<void> {
    await this.saveSearches(consultations);
    const reveals = consultations.newReveals();
    if (reveals.length === 0) {
      return;
    }
    await this.prisma.mailRecipientReveal.createMany({
      data: reveals.map((reveal) => ({
        id: reveal.id,
        mailRequestId: reveal.sendId,
        revealedBy: reveal.staffId,
        revealedAt: reveal.at,
      })),
    });
  }

  private async saveSearches(consultations: StaffMailConsultations): Promise<void> {
    for (const search of consultations.newSearches()) {
      await this.prisma.mailRecipientSearch.create({
        data: {
          id: search.id,
          searchedBy: search.staffId,
          recipientFingerprint: search.fingerprint,
          searchedAt: search.at,
        },
      });
      if (search.sendIds.length > 0) {
        await this.prisma.mailRecipientSearchHit.createMany({
          data: search.sendIds.map((mailRequestId) => ({ searchId: search.id, mailRequestId })),
        });
      }
    }
  }
}
