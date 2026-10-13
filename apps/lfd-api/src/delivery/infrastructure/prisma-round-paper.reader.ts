import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { RoundPaperReader, type RoundPaperRow } from "../domain/ports/round-paper.reader.js";
import { PlannedTiming } from "../domain/value-objects/planned-timing.js";
import { departedStopOf, EXECUTION_SELECT } from "./departed-stop.mapper.js";
import { orderStopsOnly } from "./order-stop.js";

/** Un arrêt vivant : ni retiré, ni clos — ceux que l'écran imprimait. */
const LIVE_STOP = { removedAt: null, closedAt: null } as const;

/**
 * **Adaptateur Prisma de la tournée à imprimer.** Il ne lit que les tables de
 * la livraison : la tournée, ses arrêts vivants (livraisons et transferts),
 * leur instantané du départ et les bacs de leurs commandes. Il n'écrit rien.
 */
@Injectable()
export class PrismaRoundPaperReader extends RoundPaperReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async roundOf(roundId: string): Promise<RoundPaperRow | null> {
    const row = await this.prisma.deliveryRound.findUnique({
      where: { id: roundId },
      select: {
        id: true,
        serviceDay: true,
        vehicleName: true,
        passage: true,
        driverStaffId: true,
        plannedDepartureAt: true,
        plannedReturnAt: true,
        plannedMeters: true,
        stops: {
          where: LIVE_STOP,
          orderBy: { position: "asc" },
          select: {
            id: true,
            orderId: true,
            transferId: true,
            position: true,
            execution: { select: EXECUTION_SELECT },
          },
        },
      },
    });
    if (row === null) {
      return null;
    }
    // Les livraisons d'un côté, les transferts de l'autre (2026-10-13) :
    // la composition les intercale par position.
    const stops = orderStopsOnly(row.stops);
    const codes = await this.binCodesOf(stops.map((stop) => stop.orderId));
    return {
      id: row.id,
      serviceDay: row.serviceDay,
      vehicleName: row.vehicleName,
      passage: row.passage,
      driverStaffId: row.driverStaffId,
      planned: PlannedTiming.restore({
        departureAt: row.plannedDepartureAt,
        returnAt: row.plannedReturnAt,
        meters: row.plannedMeters,
      }),
      stops: stops.map((stop) => ({
        stopId: stop.id,
        orderId: stop.orderId,
        position: stop.position,
        departed: stop.execution === null ? null : departedStopOf(stop.execution),
        binCodes: codes.get(stop.orderId) ?? [],
      })),
      transferStops: row.stops.flatMap((stop) =>
        stop.transferId === null
          ? []
          : [{ stopId: stop.id, transferId: stop.transferId, position: stop.position }],
      ),
    };
  }

  /** Les codes des bacs non annulés de ces commandes, par commande. */
  private async binCodesOf(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly string[]>> {
    if (orderIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.deliveryBin.findMany({
      where: { orderId: { in: [...orderIds] }, voidedAt: null },
      orderBy: [{ createdAt: "asc" }, { code: "asc" }],
      select: { orderId: true, code: true },
    });
    const codes = new Map<string, string[]>();
    for (const row of orderStopsOnly(rows)) {
      codes.set(row.orderId, [...(codes.get(row.orderId) ?? []), row.code]);
    }
    return codes;
  }
}
