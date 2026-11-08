import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { PurgeCensus } from "../../../platform/retention/purge-mode.js";
import { OrphanMailDeliveryPruner } from "../domain/ports/orphan-mail-delivery.pruner.js";

interface CensusRow {
  readonly count: bigint;
  readonly oldest: Date | null;
}

/**
 * La purge des retours orphelins de `mail.mail_delivery_event` : reçus avant
 * `cutoff`, et qu'aucune demande ne porte. Une suppression PHYSIQUE, admise
 * comme celle du suivi : ce n'est pas un agrégat métier, et un retour qu'aucune
 * demande ne réclamera ne sert plus à rien. Elle ne s'exécute qu'en mode `on`
 * (`MAIL_REQUEST_PURGE`).
 */
@Injectable()
export class PrismaOrphanMailDeliveryPruner extends OrphanMailDeliveryPruner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async census(cutoff: Date): Promise<PurgeCensus> {
    const [row] = await this.prisma.$queryRaw<readonly CensusRow[]>`
      SELECT count(*) AS "count", min(e."received_at") AS "oldest"
        FROM "mail"."mail_delivery_event" e
       WHERE e."received_at" < ${cutoff}
         AND NOT EXISTS (SELECT 1 FROM "mail"."mail_request" r
                          WHERE r."provider_id" = e."provider_id")`;
    return { count: Number(row?.count ?? 0n), oldest: row?.oldest ?? null };
  }

  async pruneBatch(cutoff: Date, limit: number): Promise<number> {
    return this.prisma.$executeRaw`
      DELETE FROM "mail"."mail_delivery_event"
       WHERE "id" IN (
         SELECT e."id" FROM "mail"."mail_delivery_event" e
          WHERE e."received_at" < ${cutoff}
            AND NOT EXISTS (SELECT 1 FROM "mail"."mail_request" r
                             WHERE r."provider_id" = e."provider_id")
          ORDER BY e."received_at"
          LIMIT ${limit})`;
  }
}
