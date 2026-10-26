import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../platform/database/client/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  DayRoundPapersReader,
  RoundPaperReader,
  type RoundPaperRow,
} from "../domain/ports/round-paper.reader.js";
import { PlannedTiming } from "../domain/value-objects/planned-timing.js";
import { departedStopOf, EXECUTION_SELECT } from "./departed-stop.mapper.js";
import { orderStopsOnly } from "./order-stop.js";

/** Un arrêt vivant : ni retiré, ni clos — ceux que l'écran imprimait. */
const LIVE_STOP = { removedAt: null, closedAt: null } as const;

const PAPER_SELECT = {
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
    orderBy: { position: "asc" as const },
    select: {
      id: true,
      orderId: true,
      rank: true,
      transferId: true,
      position: true,
      execution: { select: EXECUTION_SELECT },
    },
  },
} satisfies Prisma.DeliveryRoundSelect;

type PaperRoundRow = Prisma.DeliveryRoundGetPayload<{ select: typeof PAPER_SELECT }>;

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
    // Une tournée supprimée (2026-10-26) n'a plus de feuille de route.
    const row = await this.prisma.deliveryRound.findFirst({
      where: { id: roundId, removedAt: null },
      select: PAPER_SELECT,
    });
    if (row === null) {
      return null;
    }
    const [paper] = await paperRowsOf(this.prisma, [row]);
    return paper ?? null;
  }
}

/**
 * **Adaptateur Prisma des tournées d'un jour à imprimer** (le dossier des
 * tournées, 2026-10-26) — la même lecture que la feuille seule, pour toutes
 * les tournées du jour, dans l'ordre de la composition.
 */
@Injectable()
export class PrismaDayRoundPapersReader extends DayRoundPapersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async roundsOn(serviceDay: string): Promise<readonly RoundPaperRow[]> {
    const rows = await this.prisma.deliveryRound.findMany({
      where: { serviceDay, removedAt: null },
      orderBy: [{ vehicle: { createdAt: "asc" } }, { vehicleId: "asc" }, { passage: "asc" }],
      select: PAPER_SELECT,
    });
    return paperRowsOf(this.prisma, rows);
  }
}

/** Les lignes lues, avec les codes de bacs de leurs commandes, lus en une fois. */
async function paperRowsOf(
  prisma: PrismaService,
  rows: readonly PaperRoundRow[],
): Promise<readonly RoundPaperRow[]> {
  const codes = await binCodesOf(
    prisma,
    rows.flatMap((row) => orderStopsOnly(row.stops).map((stop) => stop.orderId)),
  );
  return rows.map((row) => paperRowOf(row, codes));
}

function paperRowOf(
  row: PaperRoundRow,
  codes: ReadonlyMap<string, readonly string[]>,
): RoundPaperRow {
  // Les livraisons d'un côté, les transferts de l'autre (2026-10-13) :
  // la composition les intercale par position.
  const stops = orderStopsOnly(row.stops);
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
      shipmentRank: stop.rank,
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
async function binCodesOf(
  prisma: PrismaService,
  orderIds: readonly string[],
): Promise<ReadonlyMap<string, readonly string[]>> {
  if (orderIds.length === 0) {
    return new Map();
  }
  const rows = await prisma.deliveryBin.findMany({
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
