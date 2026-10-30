import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  MadeToOrderClientReader,
  type MadeToOrderClientLine,
} from "../domain/ports/made-to-order-client.reader.js";
import { madeToOrderLinesFrom } from "./made-to-order-lines.sql.js";

/** L'enseigne, ou la raison sociale quand l'enseigne est vide (`prisma-company-namer.ts`). */
function companyName(alias: string): Prisma.Sql {
  const table = Prisma.raw(`"${alias}"`);
  return Prisma.sql`COALESCE(NULLIF(btrim(${table}."enseigne"), ''), ${table}."raison_sociale")`;
}

/** La société qui commande, son principal figé, la personne qui a commandé. */
const CLIENT_JOINS = Prisma.sql`
  LEFT JOIN "companies" "c" ON "c"."id" = "o"."company_id"
  LEFT JOIN "companies" "p" ON "p"."id" = "o"."principal_company_id"
  JOIN "users" "u" ON "u"."id" = "o"."placed_by_user_id"`;

/**
 * Les articles sur mesure (`true`) et d'avant le suivi (`NULL`) de chaque
 * client — la société qui commande, ou la personne pour un particulier.
 * Le nom du produit est le snapshot le plus grand de la période : un nom
 * corrigé en cours de période ne dédouble pas l'article.
 */
@Injectable()
export class PrismaMadeToOrderClientReader extends MadeToOrderClientReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  lines(from: string, to: string): Promise<readonly MadeToOrderClientLine[]> {
    return this.prisma.$queryRaw<MadeToOrderClientLine[]>(Prisma.sql`
      SELECT
        CASE WHEN "o"."company_id" IS NULL
          THEN 'person:' || "o"."placed_by_user_id"
          ELSE 'company:' || "o"."company_id" END AS "clientKey",
        CASE WHEN "o"."company_id" IS NULL THEN 'person' ELSE 'company' END AS "kind",
        "o"."company_id" AS "companyId",
        MAX(CASE WHEN "o"."company_id" IS NULL
          THEN btrim("u"."first_name" || ' ' || "u"."last_name")
          ELSE ${companyName("c")} END) AS "name",
        MAX(${companyName("p")}) AS "principalName",
        "l"."sku" AS "sku",
        MAX("l"."product_name_snapshot") AS "productName",
        "l"."sale_unit" AS "saleUnit",
        "l"."made_to_order" AS "madeToOrder",
        SUM("l"."quantity")::int AS "quantity",
        SUM("l"."line_total_cents")::int AS "htCents",
        COUNT(DISTINCT "o"."id")::int AS "orders"
      ${madeToOrderLinesFrom(from, to, CLIENT_JOINS)}
        AND "l"."made_to_order" IS NOT FALSE
      GROUP BY 1, 2, 3, "l"."sku", "l"."sale_unit", "l"."made_to_order"
      ORDER BY 1, "l"."sku"`);
  }
}
