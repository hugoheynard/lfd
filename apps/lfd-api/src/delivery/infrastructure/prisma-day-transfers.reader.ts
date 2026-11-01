import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { DayTransfersReader, type DayTransferRow } from "../domain/ports/day-transfers.reader.js";

const HELD_ITEM = { detachedAt: null } as const;
const LIVE_STOP = { removedAt: null, closedAt: null } as const;

/**
 * L'adaptateur de {@link DayTransfersReader} : une lecture, tables de la
 * livraison seulement. Le départ prévu est celui de la tournée de l'arrêt
 * vivant — la même source que l'heure « prête pour » du colisage
 * (`PrismaOrderDeparturesReader`, relu le 2026-11-01).
 */
@Injectable()
export class PrismaDayTransfersReader extends DayTransfersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async transfersOn(serviceDay: string): Promise<readonly DayTransferRow[]> {
    const rows = await this.prisma.deliveryInternalTransfer.findMany({
      where: { serviceDay, items: { some: HELD_ITEM } },
      orderBy: [{ siteId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        siteId: true,
        siteLabel: true,
        departedAt: true,
        items: { where: HELD_ITEM, select: { kind: true } },
        stops: {
          where: LIVE_STOP,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: 1,
          select: { round: { select: { plannedDepartureAt: true } } },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      siteId: row.siteId,
      siteLabel: row.siteLabel,
      departedAt: row.departedAt,
      plannedDepartureAt: row.stops[0]?.round.plannedDepartureAt ?? null,
      placed: row.stops.length > 0,
      orderCount: row.items.filter((item) => item.kind === "order").length,
      resupplyCount: row.items.filter((item) => item.kind === "resupply").length,
    }));
  }
}
