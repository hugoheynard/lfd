import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  MadeToOrderMonthlyReader,
  type MadeToOrderMonthTally,
} from "../domain/ports/made-to-order-monthly.reader.js";
import { LOCAL_PLACED_AT, madeToOrderLinesFrom } from "./made-to-order-lines.sql.js";

/**
 * Le HT des lignes par mois de passation et par état du marqueur — une
 * requête, un `GROUP BY` côté base. Lit les tables du commerce, et elles
 * seules.
 */
@Injectable()
export class PrismaMadeToOrderMonthlyReader extends MadeToOrderMonthlyReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  tallies(from: string, to: string): Promise<readonly MadeToOrderMonthTally[]> {
    return this.prisma.$queryRaw<MadeToOrderMonthTally[]>(Prisma.sql`
      SELECT
        to_char(${LOCAL_PLACED_AT}, 'YYYY-MM') AS "month",
        "l"."made_to_order" AS "madeToOrder",
        SUM("l"."line_total_cents")::int AS "htCents",
        COUNT(DISTINCT "o"."id")::int AS "orders"
      ${madeToOrderLinesFrom(from, to)}
      GROUP BY 1, 2
      ORDER BY 1, 2`);
  }
}
