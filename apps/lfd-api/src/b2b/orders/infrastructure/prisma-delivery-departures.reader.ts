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
 * recopié. Aucun montant ; lu par identifiants, en une requête, comme
 * `PrismaDeliveryOrderLinesReader` : aucun mur de société à poser.
 */
@Injectable()
export class PrismaDeliveryDeparturesReader extends DeliveryDeparturesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async departuresOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, DeliveryDeparture>> {
    if (orderIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.order.findMany({
      where: { id: { in: [...orderIds] } },
      select: {
        id: true,
        ...DEPARTURE_SELECT,
        lines: { ...DEPARTURE_SELECT.lines, orderBy: { id: "asc" } },
      },
    });
    return new Map(rows.map((row): [string, DeliveryDeparture] => [row.id, toDeparture(row)]));
  }
}

/** Ce qui part, sans ligne à zéro, et le reste abandonné s'il est décidé. */
function toDeparture(row: Parameters<typeof departureOf>[0]): DeliveryDeparture {
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
