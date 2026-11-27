import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  type PlannedQuantity,
  PlannedQuantitiesReader,
} from "../../channels/commerce/planned-quantities.js";
import type { PlannedColumnStatus } from "../domain/entities/planned-column.js";

/** Le seul statut que le prévisionnel lit : un brouillon pas encore commandé. */
const DRAFT: PlannedColumnStatus = "draft";

interface PlannedQuantityRow {
  readonly day: string;
  readonly sku: string;
  readonly quantity: number;
}

/**
 * `PlannedQuantitiesReader` sur `recurring.planned_columns` : le `jsonb` des
 * lignes déroulé et sommé par jour et par article dans la base, en une
 * requête, sur l'index partiel des brouillons. Prisma ne sait ni dérouler un
 * `jsonb` ni grouper par l'un de ses champs ; lire les colonnes pour plier
 * en mémoire chargerait toutes les sociétés de la plage.
 */
@Injectable()
export class PrismaPlannedQuantitiesReader extends PlannedQuantitiesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async draftBetween(from: string, to: string): Promise<readonly PlannedQuantity[]> {
    const rows = await this.prisma.$queryRaw<PlannedQuantityRow[]>(Prisma.sql`
      SELECT
        to_char("c"."service_day", 'YYYY-MM-DD') AS "day",
        "line"->>'sku' AS "sku",
        SUM(("line"->>'quantity')::integer)::integer AS "quantity"
      FROM "recurring"."planned_columns" AS "c"
      CROSS JOIN LATERAL jsonb_array_elements("c"."lines") AS "line"
      WHERE "c"."status" = ${DRAFT}
        AND "c"."service_day" BETWEEN ${from}::date AND ${to}::date
      GROUP BY 1, 2
      ORDER BY 1, 2
    `);
    return rows.map((row) => ({ day: row.day, sku: row.sku, quantity: row.quantity }));
  }
}
