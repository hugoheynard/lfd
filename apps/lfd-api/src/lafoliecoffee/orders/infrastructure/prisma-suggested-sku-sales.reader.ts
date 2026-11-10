import { BUSINESS_TIME_ZONE } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { SuggestedSkuSalesReader } from "../../recommendations/domain/ports/suggested-sku-sales.reader.js";
import type { SkuDaySales } from "../../recommendations/domain/services/suggestion-attribution.js";

/** Une commande qui n'a rien vendu : ni passée, ni maintenue. */
const UNSOLD_STATUSES = ["draft", "cancelled"] as const;

interface SalesRow {
  readonly day: string;
  readonly sku: string;
  readonly quantity: number;
  readonly revenueCents: number;
}

/**
 * Les ventes d'articles par jour de passation, pour l'attribution des
 * suggestions décidées (RS6) — implémente le port que la recommandation
 * déclare.
 *
 * **Un agrégat SQL**, pas un chargement de commandes : la base rend une ligne
 * par jour × article. Rien d'autre ne sort — ni commande, ni société, ni
 * client. Pas de mur société : c'est un total de la boutique entière, lu par
 * le staff.
 *
 * Le jour est celui de la passation à Paris (`created_at` est stocké en UTC
 * sans fuseau) : la borne sur `created_at` brut, élargie d'un jour de chaque
 * côté, garde l'index ; le filtre exact se fait sur le jour local. Une commande saisie par le staff (`placed_by_staff_id`) n'a
 * pas vu de suggestion, une commande d'abonnement non plus : elles ne
 * comptent pas.
 */
@Injectable()
export class PrismaSuggestedSkuSalesReader extends SuggestedSkuSalesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async dailySales(
    from: string,
    to: string,
    skus: readonly string[],
  ): Promise<readonly SkuDaySales[]> {
    const rows = await this.prisma.$queryRaw<SalesRow[]>`
      SELECT
        to_char(("o"."created_at" AT TIME ZONE 'UTC') AT TIME ZONE ${BUSINESS_TIME_ZONE}, 'YYYY-MM-DD') AS "day",
        "l"."sku" AS "sku",
        SUM("l"."quantity")::int AS "quantity",
        SUM("l"."line_total_cents")::int AS "revenueCents"
      FROM "order_lines" "l"
      JOIN "orders" "o" ON "o"."id" = "l"."order_id"
      WHERE "o"."created_at" >= ${from}::date - 1
        AND "o"."created_at" < ${to}::date + 2
        AND (("o"."created_at" AT TIME ZONE 'UTC') AT TIME ZONE ${BUSINESS_TIME_ZONE})::date
          BETWEEN ${from}::date AND ${to}::date
        AND "o"."status"::text NOT IN (${Prisma.join([...UNSOLD_STATUSES])})
        AND "o"."placed_by_staff_id" IS NULL
        AND "o"."from_subscription_id" IS NULL
        AND "l"."sku" IN (${Prisma.join([...skus])})
      GROUP BY 1, 2
      ORDER BY 1, 2`;
    return rows;
  }
}
