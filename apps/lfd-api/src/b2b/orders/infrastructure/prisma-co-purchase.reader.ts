import { BUSINESS_TIME_ZONE } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CoPurchaseReader,
  type CoPurchaseAsk,
} from "../../recommendations/domain/ports/co-purchase.reader.js";
import {
  BOUGHT_WITH_COUNTED_PAYMENT_STATUSES,
  BOUGHT_WITH_EXCLUDED_ORDER_STATUSES,
  type CoPurchasePair,
} from "../../recommendations/domain/services/bought-with.js";

/** L'instant de passation à Paris — `created_at` est stocké en UTC sans fuseau. */
const LOCAL_AT = Prisma.sql`(("o"."created_at" AT TIME ZONE 'UTC') AT TIME ZONE ${BUSINESS_TIME_ZONE})`;

/**
 * La clientèle d'une commande, comme le tableau des audiences la lit : la
 * colonne, et pour une commande d'avant elle, pro si elle porte une société.
 */
const CLIENTELE = Prisma.sql`CASE WHEN "o"."clientele"::text = 'pro'
  OR ("o"."clientele" IS NULL AND "o"."company_id" IS NOT NULL)
  THEN 'pro' ELSE 'public' END`;

/**
 * **Les paires d'articles d'une même commande** — implémente le port que la
 * recommandation déclare (R2, « souvent pris avec »).
 *
 * Une requête, un `GROUP BY` côté base. Le client compté est la société pour
 * un pro, la personne sinon (`COALESCE(company_id, placed_by_user_id)`) : il
 * sert au `COUNT(DISTINCT)` et ne sort pas de la requête, et une paire sous
 * le seuil n'en sort pas non plus (`HAVING`). Pas de mur société : les
 * paires traversent les comptes sans dire qui que ce soit.
 *
 * Le chemin part des lignes du panier (`order_lines.sku` est indexé), puis
 * remonte aux commandes de la fenêtre et de la clientèle, et lit leurs
 * autres lignes. Une même commande qui porte deux fois un article ne compte
 * qu'une fois (`DISTINCT`).
 */
@Injectable()
export class PrismaCoPurchaseReader extends CoPurchaseReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pairs(ask: CoPurchaseAsk): Promise<readonly CoPurchasePair[]> {
    if (ask.anchors.length === 0) {
      return [];
    }
    const anchors = Prisma.join([...ask.anchors]);
    return this.prisma.$queryRaw<CoPurchasePair[]>`
      WITH "anchored" AS (
        SELECT DISTINCT
          "o"."id" AS "id",
          COALESCE("o"."company_id", "o"."placed_by_user_id") AS "client",
          "l"."sku" AS "sku"
        FROM "order_lines" "l"
        JOIN "orders" "o" ON "o"."id" = "l"."order_id"
        WHERE "l"."sku" IN (${anchors})
          AND "o"."created_at" >= ${ask.since}::date - 1
          AND ${LOCAL_AT}::date >= ${ask.since}::date
          AND "o"."status"::text NOT IN (${Prisma.join([...BOUGHT_WITH_EXCLUDED_ORDER_STATUSES])})
          AND "o"."payment_status"::text IN (${Prisma.join([...BOUGHT_WITH_COUNTED_PAYMENT_STATUSES])})
          AND "o"."from_subscription_id" IS NULL
          AND ${CLIENTELE} = ${ask.audience}
      ),
      "companions" AS (
        SELECT DISTINCT "l"."order_id" AS "id", "l"."sku" AS "sku"
        FROM "order_lines" "l"
        WHERE "l"."order_id" IN (SELECT "id" FROM "anchored")
          AND "l"."sku" NOT IN (${anchors})
      )
      SELECT
        "a"."sku" AS "anchorSku",
        "c"."sku" AS "withSku",
        COUNT(DISTINCT "a"."client")::int AS "clients"
      FROM "anchored" "a"
      JOIN "companions" "c" ON "c"."id" = "a"."id"
      GROUP BY 1, 2
      HAVING COUNT(DISTINCT "a"."client") >= ${ask.minClients}
      ORDER BY 3 DESC, 2, 1
      LIMIT ${ask.limit}`;
  }
}
