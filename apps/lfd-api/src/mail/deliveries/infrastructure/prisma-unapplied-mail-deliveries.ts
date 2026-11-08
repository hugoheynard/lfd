import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  UnappliedMailDeliveries,
  type UnappliedMailDelivery,
} from "../../requests/domain/ports/unapplied-mail-deliveries.js";
import { reportOf } from "./delivery-row.js";

interface UnappliedRow {
  readonly provider_id: string;
  readonly delivery: string;
  readonly kind: string | null;
  readonly occurred_at: Date;
}

/**
 * Les retours rangés plus graves que celui de leur demande. Le rang est
 * celui de `MAIL_DELIVERIES` (`delayed` < `delivered` < `complained` <
 * `bounced`), écrit ici une seconde fois en SQL ; l'e2e du balayeur prouve
 * que les deux disent la même chose. Les deux tables sont du schéma `mail`.
 */
@Injectable()
export class PrismaUnappliedMailDeliveries extends UnappliedMailDeliveries {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async due(receivedSince: Date, limit: number): Promise<readonly UnappliedMailDelivery[]> {
    const rows = await this.prisma.$queryRaw<readonly UnappliedRow[]>`
      SELECT "provider_id", "delivery", "kind", "occurred_at" FROM (
        SELECT DISTINCT ON (e."provider_id")
               e."provider_id", e."delivery", e."kind", e."occurred_at", e."received_at"
          FROM "mail"."mail_delivery_event" e
          JOIN "mail"."mail_request" r ON r."provider_id" = e."provider_id"
         WHERE e."received_at" >= ${receivedSince}
           AND (r."delivery" IS NULL
                OR array_position(ARRAY['delayed','delivered','complained','bounced']::text[], e."delivery"::text)
                 > array_position(ARRAY['delayed','delivered','complained','bounced']::text[], r."delivery"::text))
         ORDER BY e."provider_id",
                  array_position(ARRAY['delayed','delivered','complained','bounced']::text[], e."delivery"::text) DESC,
                  e."received_at"
      ) worst
      ORDER BY "received_at"
      LIMIT ${limit}`;
    return rows.map((row) => ({
      providerId: row.provider_id,
      report: reportOf({ delivery: row.delivery, kind: row.kind, occurredAt: row.occurred_at }),
    }));
  }
}
