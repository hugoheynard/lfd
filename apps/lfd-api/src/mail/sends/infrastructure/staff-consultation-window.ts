import type { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  consultationWindowStart,
  StaffMailConsultations,
} from "../domain/entities/staff-mail-consultations.js";

interface WindowRow {
  readonly count: bigint;
  readonly oldest: Date | null;
}

/**
 * **Le plafond PARTAGÉ des consultations d'une personne** : adresses
 * révélées et recherches du suivi des envois, ET du registre de préférence
 * (plan de désinscription, C4), comptées ensemble sur la dernière heure.
 *
 * Pose d'abord `pg_advisory_xact_lock` sur la personne — la même clé pour
 * les deux familles —, relâché au `COMMIT` ou au `ROLLBACK` : deux
 * consultations simultanées ne lisent pas le même compte. À appeler sous une
 * unité de travail.
 */
export async function loadStaffConsultations(
  prisma: PrismaService,
  staffId: string,
  now: Date,
): Promise<StaffMailConsultations> {
  const key = `mail-consultations:${staffId}`;
  await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  const since = consultationWindowStart(now);
  const [row] = await prisma.$queryRaw<readonly WindowRow[]>`
    SELECT count(*) AS "count", min(t."at") AS "oldest" FROM (
      SELECT "revealed_at" AS "at" FROM "mail"."mail_recipient_reveal"
       WHERE "revealed_by" = ${staffId} AND "revealed_at" > ${since}
      UNION ALL
      SELECT "searched_at" FROM "mail"."mail_recipient_search"
       WHERE "searched_by" = ${staffId} AND "searched_at" > ${since}
      UNION ALL
      SELECT "consulted_at" FROM "mail"."mail_preference_consultation"
       WHERE "staff_id" = ${staffId} AND "consulted_at" > ${since}
    ) t`;
  return StaffMailConsultations.of(staffId, Number(row?.count ?? 0n), row?.oldest ?? null);
}
