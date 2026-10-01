import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { DeliveryRoundsReader, type RoundRow } from "../domain/ports/delivery-rounds.reader.js";

/** Un arrêt vivant : ni retiré, ni clos (C12). */
const LIVE_STOP = { removedAt: null, closedAt: null } as const;

/** Adaptateur Prisma de la lecture de la composition. Il n'écrit rien. */
@Injectable()
export class PrismaDeliveryRoundsReader extends DeliveryRoundsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async roundsOn(serviceDay: string): Promise<readonly RoundRow[]> {
    const rows = await this.prisma.deliveryRound.findMany({
      where: { serviceDay },
      orderBy: [{ vehicle: { createdAt: "asc" } }, { vehicleId: "asc" }, { passage: "asc" }],
      include: {
        vehicle: { select: { retiredAt: true } },
        stops: { where: LIVE_STOP, orderBy: { position: "asc" } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      vehicleId: row.vehicleId,
      vehicleName: row.vehicleName,
      passage: row.passage,
      version: row.version,
      vehicleRetiredAt: row.vehicle.retiredAt,
      departedAt: row.departedAt,
      driverStaffId: row.driverStaffId,
      returnedAt: row.returnedAt,
      stops: row.stops.map((stop) => ({
        stopId: stop.id,
        orderId: stop.orderId,
        position: stop.position,
      })),
    }));
  }

  async composedAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (orderIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.deliveryRoundStop.findMany({
      where: { orderId: { in: [...orderIds] }, ...LIVE_STOP },
      select: { orderId: true },
    });
    return new Set(rows.map((row) => row.orderId));
  }
}
