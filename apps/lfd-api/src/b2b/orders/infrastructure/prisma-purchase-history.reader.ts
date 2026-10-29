import { BUSINESS_TIME_ZONE } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  PurchaseHistoryReader,
  type PurchaseHistoryAsk,
} from "../../recommendations/domain/ports/purchase-history.reader.js";
import {
  USUALS_COUNTED_PAYMENT_STATUSES,
  USUALS_EXCLUDED_ORDER_STATUSES,
  type PurchasedSku,
} from "../../recommendations/domain/services/usuals.js";

/** Le jour de passation à Paris — `created_at` est stocké en UTC sans fuseau. */
const PLACED_DAY = Prisma.sql`((("o"."created_at" AT TIME ZONE 'UTC') AT TIME ZONE ${BUSINESS_TIME_ZONE})::date)`;

/**
 * **L'historique d'achat d'une société** — implémente le port que la
 * recommandation déclare (R1, « vos habituels »).
 *
 * 🔴 Le mur : `"o"."company_id" = $companyId` dans le `WHERE`, et l'agrégat
 * ne lit rien d'autre. Une requête, un `GROUP BY` côté base ; chaque commande
 * ne compte qu'une fois par article (`DISTINCT` sur la commande et le SKU),
 * même si elle le porte sur deux lignes.
 *
 * Le jour rendu est celui pour lequel la commande est passée
 * (`requested_delivery_date`), sinon son jour de passation ; la FENÊTRE, elle,
 * se compte sur la passation, comme les habitudes du back-office
 * (`PrismaCustomerSkuReader`).
 *
 * Par ARTICLE : une ligne passée sous une ancienne référence compte pour sa
 * cible (`sale_sku_alias`, la règle de `SaleSkuAliases.canonical` écrite en
 * SQL parce que le `GROUP BY` est en base). Sans cela, trois commandes sous
 * `PAI-001` puis une sous `PAI-001-1` passeraient sous le seuil des trois
 * commandes (`plan-defaut-sous-sa-reference.md`, § 10). Table vide jusqu'au L3.
 */
@Injectable()
export class PrismaPurchaseHistoryReader extends PurchaseHistoryReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofCompany(ask: PurchaseHistoryAsk): Promise<readonly PurchasedSku[]> {
    return this.prisma.$queryRaw<PurchasedSku[]>`
      SELECT "t"."sku" AS "sku", array_agg("t"."day" ORDER BY "t"."day") AS "days"
      FROM (
        SELECT DISTINCT
          "o"."id" AS "id",
          COALESCE("a"."target_sku", "l"."sku") AS "sku",
          to_char(COALESCE("o"."requested_delivery_date", ${PLACED_DAY}), 'YYYY-MM-DD') AS "day"
        FROM "order_lines" "l"
        JOIN "orders" "o" ON "o"."id" = "l"."order_id"
        LEFT JOIN "sale_sku_alias" "a" ON "a"."alias_sku" = "l"."sku"
        WHERE "o"."company_id" = ${ask.companyId}
          AND "o"."created_at" >= ${ask.since}::date - 1
          AND ${PLACED_DAY} >= ${ask.since}::date
          AND "o"."status"::text NOT IN (${Prisma.join([...USUALS_EXCLUDED_ORDER_STATUSES])})
          AND "o"."payment_status"::text IN (${Prisma.join([...USUALS_COUNTED_PAYMENT_STATUSES])})
          AND "o"."from_subscription_id" IS NULL
      ) "t"
      GROUP BY "t"."sku"
      ORDER BY "t"."sku"`;
  }
}
