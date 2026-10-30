import { BUSINESS_TIME_ZONE } from "@lfd/contracts";

import { Prisma } from "../../../platform/database/client/client.js";
import { REVENUE_ORDER_STATUSES, REVENUE_PAYMENT_STATUSES } from "../domain/revenue-scope.js";

/** L'instant de passation à Paris — `created_at` est stocké en UTC sans fuseau. */
export const LOCAL_PLACED_AT = Prisma.sql`(("o"."created_at" AT TIME ZONE 'UTC') AT TIME ZONE ${BUSINESS_TIME_ZONE})`;

/**
 * **Les lignes des rapports du sur mesure** (lot R) : `FROM order_lines "l"
 * JOIN orders "o"`, sous le périmètre du chiffre d'affaires
 * (`revenue-scope.ts` — la même règle que `revenueWhere`, en SQL), sur les
 * jours de passation à Paris de `from` à `to` compris. La borne brute sur
 * `created_at`, élargie d'un jour de chaque côté, garde l'index — la figure
 * de `prisma-audience-order.reader.ts`. `joins` s'insère avant le `WHERE`.
 */
export function madeToOrderLinesFrom(
  from: string,
  to: string,
  joins: Prisma.Sql = Prisma.empty,
): Prisma.Sql {
  return Prisma.sql`
    FROM "order_lines" "l"
    JOIN "orders" "o" ON "o"."id" = "l"."order_id"
    ${joins}
    WHERE "o"."created_at" >= ${from}::date - 1
      AND "o"."created_at" < ${to}::date + 2
      AND ${LOCAL_PLACED_AT}::date BETWEEN ${from}::date AND ${to}::date
      AND "o"."status"::text IN (${Prisma.join([...REVENUE_ORDER_STATUSES])})
      AND "o"."payment_status"::text IN (${Prisma.join([...REVENUE_PAYMENT_STATUSES])})`;
}
