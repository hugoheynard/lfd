import { addDays, localToInstant } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { SalesExportReader, type SalesExportOrder } from "../domain/ports/sales-export.reader.js";
import { SALES_EXPORT_SELECT, salesExportOrderOf } from "./sales-export.rows.js";

/** Minuit à Paris existe tous les jours : seul un jour mal formé ne se lit pas. */
const MIDNIGHT = "00:00";

/**
 * **Les commandes passées d'une période** — UNE requête Prisma pour toute la
 * période, lignes et remises couvertes comprises (le client Prisma charge
 * les relations par lot, jamais par commande).
 *
 * `created_at` est un instant UTC : la période se traduit en
 * `[minuit de Paris du premier jour, minuit de Paris du lendemain du dernier[`,
 * ce qui suit l'heure d'été sans rien supposer du décalage.
 */
@Injectable()
export class PrismaSalesExportReader extends SalesExportReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async placedBetween(fromDay: string, toDay: string): Promise<readonly SalesExportOrder[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: parisMidnightOf(fromDay), lt: parisMidnightOf(addDays(toDay, 1)) },
      },
      select: SALES_EXPORT_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(salesExportOrderOf);
  }
}

/** @throws {UnreadableSalesExportDayError} un jour qui n'est pas `AAAA-MM-JJ`. */
function parisMidnightOf(day: string): Date {
  const instant = localToInstant(day, MIDNIGHT);
  if (instant === null) {
    throw new UnreadableSalesExportDayError(day);
  }
  return instant;
}

/** Un jour mal formé est arrivé jusqu'à la lecture : l'appelant devait le refuser. */
export class UnreadableSalesExportDayError extends TechnicalError {
  constructor(day: string) {
    super(
      "orders.sales_export.unreadable_day",
      `Le jour « ${day} » ne se lit pas comme AAAA-MM-JJ : la période de l'export devait être refusée avant la lecture des commandes. Signalez-le à l'équipe technique.`,
    );
  }
}
