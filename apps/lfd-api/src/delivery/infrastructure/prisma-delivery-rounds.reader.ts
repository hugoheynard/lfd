import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { DeliveryRoundsReader, type RoundRow } from "../domain/ports/delivery-rounds.reader.js";
import { PlannedTiming } from "../domain/value-objects/planned-timing.js";
import { stopSubjectOf } from "./delivery-round.writes.js";
import { orderStopsOnly } from "./order-stop.js";

/** Un arrêt vivant : ni retiré, ni clos (C12). */
const LIVE_STOP = { removedAt: null, closedAt: null } as const;

/**
 * Les éléments PORTÉS d'un transfert (un élément sorti à la réouverture
 * n'y est plus), avec leur genre : commandes et réassorts se comptent à part.
 */
const CARRIED_ITEMS = { where: { detachedAt: null }, select: { kind: true } } as const;

/** Adaptateur Prisma de la lecture de la composition. Il n'écrit rien. */
@Injectable()
export class PrismaDeliveryRoundsReader extends DeliveryRoundsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async roundsOn(serviceDay: string): Promise<readonly RoundRow[]> {
    const rows = await this.prisma.deliveryRound.findMany({
      // Une tournée supprimée (2026-10-26) ne se compose plus : elle sort du jour.
      where: { serviceDay, removedAt: null },
      orderBy: [{ vehicle: { createdAt: "asc" } }, { vehicleId: "asc" }, { passage: "asc" }],
      include: {
        vehicle: { select: { retiredAt: true } },
        stops: {
          where: LIVE_STOP,
          orderBy: { position: "asc" },
          include: {
            transfer: {
              select: {
                siteId: true,
                siteLabel: true,
                items: CARRIED_ITEMS,
              },
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
                  {
                    siteId: stop.transfer.siteId,
                    siteLabel: stop.transfer.siteLabel,
                    orderCount: countOf(stop.transfer.items, "order"),
                    resupplyCount: countOf(stop.transfer.items, "resupply"),
                  },
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

/** Le nombre d'éléments portés de ce genre. */
function countOf(items: readonly { readonly kind: string }[], kind: string): number {
  return items.filter((item) => item.kind === kind).length;
}
