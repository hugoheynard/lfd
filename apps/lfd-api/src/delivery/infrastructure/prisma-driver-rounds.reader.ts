import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  DriverRoundsReader,
  type DriverRoundRow,
  type DriverRoundSummaryRow,
} from "../domain/ports/driver-rounds.reader.js";
import { departedStopOf, EXECUTION_SELECT } from "./departed-stop.mapper.js";

/** Un arrêt non retiré — les clos (lot 6) compris : le livreur voit qu'il est passé. */
const KEPT_STOP = { removedAt: null } as const;

/** Les tournées dans l'ordre de la flotte, puis par passage — comme la composition. */
const ROUND_ORDER = [
  { vehicle: { createdAt: "asc" } },
  { vehicleId: "asc" },
  { passage: "asc" },
] as const;

/**
 * 🔴 **Le mur du livreur** (plan « Ma tournée », MT-D3 v2) — UN `where`, lu par
 * la liste ET par le détail. Une tournée d'un autre livreur, ou sans livreur,
 * n'est jamais lue.
 */
function driverWall(staffUserId: string): { readonly driverStaffId: string } {
  return { driverStaffId: staffUserId };
}

/**
 * **Adaptateur Prisma des tournées du livreur.** Il ne lit que les tables de
 * la livraison : la tournée, ses arrêts, leur instantané du départ, et les
 * bacs de leurs commandes. Il n'écrit rien.
 */
@Injectable()
export class PrismaDriverRoundsReader extends DriverRoundsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async roundsOf(staffUserId: string, day: string): Promise<readonly DriverRoundSummaryRow[]> {
    const rows = await this.prisma.deliveryRound.findMany({
      where: { ...driverWall(staffUserId), serviceDay: day },
      orderBy: [...ROUND_ORDER],
      select: {
        id: true,
        vehicleName: true,
        passage: true,
        departedAt: true,
        _count: { select: { stops: { where: KEPT_STOP } } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      vehicleName: row.vehicleName,
      passage: row.passage,
      departedAt: row.departedAt,
      stopCount: row._count.stops,
    }));
  }

  async roundOf(staffUserId: string, roundId: string): Promise<DriverRoundRow | null> {
    const row = await this.prisma.deliveryRound.findFirst({
      where: { ...driverWall(staffUserId), id: roundId },
      select: {
        id: true,
        serviceDay: true,
        vehicleName: true,
        passage: true,
        version: true,
        departedAt: true,
        stops: {
          where: KEPT_STOP,
          orderBy: { position: "asc" },
          select: {
            id: true,
            orderId: true,
            position: true,
            closedAt: true,
            execution: { select: EXECUTION_SELECT },
          },
        },
      },
    });
    if (row === null) {
      return null;
    }
    const bins = await this.binsOf(row.stops.map((stop) => stop.orderId));
    return {
      id: row.id,
      serviceDay: row.serviceDay,
      vehicleName: row.vehicleName,
      passage: row.passage,
      version: row.version,
      departedAt: row.departedAt,
      stops: row.stops.map((stop) => ({
        stopId: stop.id,
        orderId: stop.orderId,
        position: stop.position,
        closedAt: stop.closedAt,
        departed: stop.execution === null ? null : departedStopOf(stop.execution),
        bins: bins.get(stop.orderId)?.bins ?? 0,
        coldBins: bins.get(stop.orderId)?.coldBins ?? 0,
      })),
    };
  }

  /** Les bacs non annulés de ces commandes, comptés, et les isothermes parmi eux. */
  private async binsOf(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, { readonly bins: number; readonly coldBins: number }>> {
    if (orderIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.deliveryBin.findMany({
      where: { orderId: { in: [...orderIds] }, voidedAt: null },
      select: { orderId: true, binType: { select: { isotherm: true } } },
    });
    const counts = new Map<string, { bins: number; coldBins: number }>();
    for (const row of rows) {
      const count = counts.get(row.orderId) ?? { bins: 0, coldBins: 0 };
      counts.set(row.orderId, {
        bins: count.bins + 1,
        coldBins: count.coldBins + (row.binType.isotherm ? 1 : 0),
      });
    }
    return counts;
  }
}
