import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { PurgeCensus } from "../../../platform/retention/purge-mode.js";
import { PendingConsentPruner } from "../domain/ports/pending-consent.pruner.js";

/** La seule valeur d'état que la purge lit. */
const PENDING = "pending";
/** Ce que redevient une réinscription jamais confirmée. */
const UNSUBSCRIBED = "unsubscribed";

/**
 * La purge des demandes d'accord jamais confirmées : une suppression
 * PHYSIQUE, décidée par le plan (règles 18 et 21 — « une commande abandonnée
 * laisse au plus une ligne `pending` qui expire »). Une demande non
 * confirmée n'est ni un accord ni un refus : elle n'a rien à prouver. Les
 * lignes `accepted` et `unsubscribed` ne sont JAMAIS lues ici. Elle ne
 * s'exécute qu'en mode `on` (`MAIL_REQUEST_PURGE`).
 */
@Injectable()
export class PrismaPendingConsentPruner extends PendingConsentPruner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async census(cutoff: Date): Promise<PurgeCensus> {
    const where = { status: PENDING, requestedAt: { lt: cutoff } };
    const [count, oldest] = await Promise.all([
      this.prisma.mailMarketingPreference.count({ where }),
      this.prisma.mailMarketingPreference.aggregate({ where, _min: { requestedAt: true } }),
    ]);
    return { count, oldest: oldest._min.requestedAt };
  }

  /**
   * Une réinscription jamais confirmée (C3) n'est PAS supprimée : elle porte
   * encore la désinscription qu'elle aurait levée, et redevient
   * `unsubscribed` — la supprimer rouvrirait la question à une adresse qui
   * a dit non. Le reste du lot part.
   */
  async pruneBatch(cutoff: Date, limit: number): Promise<number> {
    const reverted = await this.prisma.$executeRaw`
      UPDATE "mail"."mail_marketing_preference" SET "status" = ${UNSUBSCRIBED}
       WHERE "id" IN (
        SELECT "id" FROM "mail"."mail_marketing_preference"
         WHERE "status" = ${PENDING} AND "requested_at" < ${cutoff}
           AND "unsubscribed_at" IS NOT NULL
         ORDER BY "requested_at" LIMIT ${limit})`;
    const deleted = await this.prisma.$executeRaw`
      DELETE FROM "mail"."mail_marketing_preference" WHERE "id" IN (
        SELECT "id" FROM "mail"."mail_marketing_preference"
         WHERE "status" = ${PENDING} AND "requested_at" < ${cutoff}
           AND "unsubscribed_at" IS NULL
         ORDER BY "requested_at" LIMIT ${Math.max(limit - reverted, 0)})`;
    return reverted + deleted;
  }
}
