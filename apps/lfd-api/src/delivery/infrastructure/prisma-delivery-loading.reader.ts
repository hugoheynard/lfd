import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../platform/database/client/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import type { StopPlace } from "../domain/entities/shared-bin.js";
import {
  type BinDestinationRow,
  type BinRow,
  DeliveryLoadingReader,
  type LoadingRoundRow,
} from "../domain/ports/delivery-loading.reader.js";
import { binRowById, binRowsOf } from "./loading-bin-rows.js";
import { stopSubjectOf } from "./delivery-round.writes.js";
import { orderStopsOnly } from "./order-stop.js";

/** Un arrêt vivant : ni retiré, ni clos (C12). */
const LIVE_STOP = { removedAt: null, closedAt: null } as const;

/** Une tournée, ses arrêts vivants, et les bacs CHARGÉS dans chacun. */
const ROUND_SELECT = {
  id: true,
  serviceDay: true,
  vehicleName: true,
  passage: true,
  version: true,
  departedAt: true,
  stops: {
    where: LIVE_STOP,
    orderBy: { position: "asc" },
    select: {
      id: true,
      kind: true,
      orderId: true,
      rank: true,
      transferId: true,
      transfer: {
        select: {
          siteId: true,
          siteLabel: true,
          // R4c : un réassort « au plus tôt » rangé après le chargement.
          items: {
            where: { kind: "resupply", detachedAt: null },
            select: { attachedAt: true },
          },
        },
      },
      position: true,
      binLoads: { where: { loadedAt: { not: null } }, select: { binId: true, loadedAt: true } },
    },
  },
} as const;

/**
 * **Adaptateur Prisma des lectures du chargement** (lot 4 ; lot 4 bis,
 * tranche B). Il ne verrouille rien et n'écrit rien : ouvrir un QR, imprimer
 * ou regarder un véhicule ne change pas le chargement.
 */
@Injectable()
export class PrismaDeliveryLoadingReader extends DeliveryLoadingReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async round(roundId: string): Promise<LoadingRoundRow | null> {
    const [round] = await this.readRounds({ id: roundId });
    return round ?? null;
  }

  roundsOn(serviceDay: string): Promise<readonly LoadingRoundRow[]> {
    return this.readRounds({ serviceDay });
  }

  /** Trois lectures quel que soit le nombre de tournées : tournées, bacs, moitiés partenaires. */
  private async readRounds(
    where: { readonly id: string } | { readonly serviceDay: string },
  ): Promise<LoadingRoundRow[]> {
    const rounds = await this.prisma.deliveryRound.findMany({
      where,
      orderBy: [{ vehicle: { createdAt: "asc" } }, { vehicleId: "asc" }, { passage: "asc" }],
      select: ROUND_SELECT,
    });
    const carried = await this.transferOrdersOf(
      rounds.flatMap((round) => round.stops.flatMap((stop) => stop.transferId ?? [])),
    );
    const orderIds = rounds.flatMap((round) =>
      round.stops.flatMap((stop) => stop.orderId ?? carried.get(stop.transferId ?? "") ?? []),
    );
    const transferIds = rounds.flatMap((round) =>
      round.stops.flatMap((stop) => stop.transferId ?? []),
    );
    const bins = await binRowsOf(this.prisma, orderIds, transferIds);
    return rounds.map((round) => ({
      id: round.id,
      serviceDay: round.serviceDay,
      vehicleName: round.vehicleName,
      passage: round.passage,
      version: round.version,
      departedAt: round.departedAt,
      stops: round.stops.map((stop) => ({
        ...stopSubjectOf(stop),
        stopId: stop.id,
        siteLabel: stop.transfer?.siteLabel ?? null,
        siteId: stop.transfer?.siteId ?? null,
        ...(stop.transfer === null
          ? {}
          : { resuppliesAttachedAt: stop.transfer.items.map((item) => item.attachedAt) }),
        position: stop.position,
        bins: bins.filter((bin) => isCarriedBy(stop, carried, bin)),
        loaded: new Map(
          stop.binLoads.flatMap((load) =>
            load.loadedAt === null ? [] : [[load.binId, load.loadedAt] as const],
          ),
        ),
      })),
    }));
  }

  /** Les commandes de chaque transfert, par transfert. */
  private async transferOrdersOf(
    transferIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly string[]>> {
    if (transferIds.length === 0) {
      return new Map();
    }
    const items = await this.prisma.deliveryInternalTransferItem.findMany({
      where: { transferId: { in: [...transferIds] }, kind: "order" },
      orderBy: [{ attachedAt: "asc" }, { id: "asc" }],
      select: { transferId: true, orderId: true },
    });
    const byTransfer = new Map<string, string[]>();
    for (const item of orderStopsOnly(items)) {
      byTransfer.set(item.transferId, [...(byTransfer.get(item.transferId) ?? []), item.orderId]);
    }
    return byTransfer;
  }

  orderBins(orderId: string): Promise<readonly BinRow[]> {
    return binRowsOf(this.prisma, [orderId]);
  }

  transferBins(transferId: string): Promise<readonly BinRow[]> {
    return binRowsOf(this.prisma, [], [transferId]);
  }

  bin(binId: string): Promise<BinRow | null> {
    return binRowById(this.prisma, binId);
  }

  async placesOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, StopPlace>> {
    if (orderIds.length === 0) {
      return new Map();
    }
    const own = await this.prisma.deliveryRoundStop.findMany({
      where: { orderId: { in: [...orderIds] }, ...LIVE_STOP },
      select: { roundId: true },
    });
    const roundIds = [...new Set(own.map((stop) => stop.roundId))];
    // Le RANG, pas la position : c'est la même définition que la tournée
    // écrite (`roundOrderIds`), quelles que soient les positions en base.
    const stops = await this.prisma.deliveryRoundStop.findMany({
      where: { roundId: { in: roundIds }, ...LIVE_STOP },
      orderBy: [{ roundId: "asc" }, { position: "asc" }],
      select: { roundId: true, orderId: true },
    });
    const places = new Map<string, StopPlace>();
    const ranks = new Map<string, number>();
    for (const stop of stops) {
      const rank = ranks.get(stop.roundId) ?? 0;
      ranks.set(stop.roundId, rank + 1);
      // Un arrêt de transfert occupe un rang sans placer de commande.
      if (stop.orderId !== null) {
        places.set(stop.orderId, { roundId: stop.roundId, rank });
      }
    }
    return places;
  }

  destinationOf(orderId: string, binId: string): Promise<BinDestinationRow | null> {
    // Sa propre tournée, ou celle du transfert interne qui l'emporte (lot T1).
    return this.destination(
      { OR: [{ orderId }, { transfer: { items: { some: { kind: "order", orderId } } } }] },
      binId,
    );
  }

  transferDestinationOf(transferId: string, binId: string): Promise<BinDestinationRow | null> {
    return this.destination({ transferId }, binId);
  }

  private async destination(
    subject: Prisma.DeliveryRoundStopWhereInput,
    binId: string,
  ): Promise<BinDestinationRow | null> {
    const stop = await this.prisma.deliveryRoundStop.findFirst({
      where: { ...LIVE_STOP, ...subject },
      select: {
        round: {
          select: {
            id: true,
            serviceDay: true,
            vehicleName: true,
            passage: true,
            departedAt: true,
          },
        },
        binLoads: { where: { binId }, select: { loadedAt: true } },
      },
    });
    if (stop === null) {
      return null;
    }
    return {
      roundId: stop.round.id,
      serviceDay: stop.round.serviceDay,
      vehicleName: stop.round.vehicleName,
      passage: stop.round.passage,
      departedAt: stop.round.departedAt,
      loadedAt: stop.binLoads[0]?.loadedAt ?? null,
    };
  }
}

/**
 * Ce bac part-il avec cet arrêt ? Celui de sa commande ; pour un arrêt de
 * transfert, ceux du transfert (lot T3) et ceux de ses commandes d'avant T3.
 */
function isCarriedBy(
  stop: { readonly orderId: string | null; readonly transferId: string | null },
  carried: ReadonlyMap<string, readonly string[]>,
  bin: BinRow,
): boolean {
  const { owner } = bin;
  if (owner.kind === "transfer") {
    return owner.transferId === stop.transferId;
  }
  if (stop.orderId !== null) {
    return stop.orderId === owner.orderId;
  }
  return (carried.get(stop.transferId ?? "") ?? []).includes(owner.orderId);
}
