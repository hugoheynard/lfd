import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { AtelierSheetsReader } from "../channels/handover/atelier-sheets.reader.js";
import { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/**
 * **Les commandes sans feuille d'atelier**, dites par la production —
 * l'adaptateur du port qu'elle publie. Une seule lecture du schéma
 * `production` : la journée et, dans le même aller-retour, celles de ces
 * commandes que son plan porte.
 */
@Injectable()
export class PrismaAtelierSheetsReader extends AtelierSheetsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async withoutSheet(
    serviceDay: string,
    orderIds: readonly string[],
  ): Promise<ReadonlySet<string>> {
    if (orderIds.length === 0) {
      return new Set();
    }
    const day = await this.prisma.productionDay.findUnique({
      where: { serviceDay: ServiceDay.of(serviceDay).value },
      select: {
        closedAt: true,
        orders: { where: { orderId: { in: [...orderIds] } }, select: { orderId: true } },
      },
    });
    // Journée ouverte ou jamais ouverte : aucun plan, donc personne n'est en
    // retard sur lui (cf. le port).
    if (day === null || day.closedAt === null) {
      return new Set();
    }
    const sheeted = new Set(day.orders.map((order) => order.orderId));
    return new Set(orderIds.filter((orderId) => !sheeted.has(orderId)));
  }
}
