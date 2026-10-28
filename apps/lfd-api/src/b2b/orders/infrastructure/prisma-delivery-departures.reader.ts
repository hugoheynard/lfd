import { Injectable } from "@nestjs/common";

import {
  type DeliveryDeparture,
  DeliveryDeparturesReader,
} from "../../../delivery/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { DEPARTURE_SELECT, departureOf } from "./handover-order.query.js";

/**
 * **Ce qui part d'une commande, relayé à « Ma tournée »** — l'adaptateur de
 * `DeliveryDeparturesReader` (2026-10-25). La même lecture que le comptoir et
 * la feuille de route (`DEPARTURE_SELECT`, `departureOf`) : rien n'est
 * recopié. Aucun montant ; lu par identifiant, comme
 * `PrismaDeliveryOrderLinesReader` : aucun mur de société à poser.
 */
@Injectable()
export class PrismaDeliveryDeparturesReader extends DeliveryDeparturesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async departureOf(orderId: string): Promise<DeliveryDeparture> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        ...DEPARTURE_SELECT,
        lines: { ...DEPARTURE_SELECT.lines, orderBy: { id: "asc" } },
      },
    });
    if (row === null) {
      return { lines: [], shortfall: null };
    }
    const departure = departureOf(row);
    return {
      lines: departure.lines
        .filter((line) => line.quantity > 0)
        .map((line) => ({
          sku: line.sku,
          name: line.productName,
          quantity: line.quantity,
          saleUnit: line.saleUnit,
        })),
      shortfall:
        departure.remainder === null
          ? null
          : { remainder: departure.remainder, lines: departure.abandoned },
    };
  }
}
