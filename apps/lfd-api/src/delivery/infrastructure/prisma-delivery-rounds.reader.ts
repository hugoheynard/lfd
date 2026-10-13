import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { DeliveryRoundsReader, type RoundRow } from "../domain/ports/delivery-rounds.reader.js";
import { PlannedTiming } from "../domain/value-objects/planned-timing.js";
import { stopSubjectOf } from "./delivery-round.writes.js";
import { orderStopsOnly } from "./order-stop.js";

/** Un arrêt vivant : ni retiré, ni clos (C12). */
const LIVE_STOP = { removedAt: null, closedAt: null } as const;

/** Un élément « commande » d'un transfert — le réassort n'est pas bâti. */
const ORDER_ITEM = { kind: "order" } as const;

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
        stops: {
          where: LIVE_STOP,
          orderBy: { position: "asc" },
          include: {
            transfer: {
              select: { siteLabel: true, _count: { select: { items: { where: ORDER_ITEM } } } },
            },
          },
        },
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
      planned: PlannedTiming.restore({
        departureAt: row.plannedDepartureAt,
        returnAt: row.plannedReturnAt,
        meters: row.plannedMeters,
      }),
      stops: row.stops.map((stop) => ({
        ...stopSubjectOf(stop),
        stopId: stop.id,
        position: stop.position,
      })),
      transfers: new Map(
        row.stops.flatMap((stop) =>
          stop.transfer === null || stop.transferId === null
            ? []
            : [
                [
                  stop.transferId,
                  { siteLabel: stop.transfer.siteLabel, orderCount: stop.transfer._count.items },
                ] as const,
              ],
        ),
      ),
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
    return new Set(orderStopsOnly(rows).map((row) => row.orderId));
  }
}
