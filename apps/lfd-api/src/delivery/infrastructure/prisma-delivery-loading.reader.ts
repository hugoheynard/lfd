import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { StopPlace } from "../domain/entities/shared-bin.js";
import {
  type BinDestinationRow,
  type BinRow,
  DeliveryLoadingReader,
  type LoadingRoundRow,
} from "../domain/ports/delivery-loading.reader.js";
import { binHalfOf } from "./bin-half.js";
import { partnersOf } from "./bin-partners.js";
import { stopSubjectOf } from "./delivery-round.writes.js";
import { orderStopsOnly } from "./order-stop.js";

const BIN_SELECT = {
  id: true,
  orderId: true,
  code: true,
  voidedAt: true,
  half: true,
  physicalBinId: true,
  innerBags: true,
  binType: { select: { id: true, name: true, isotherm: true, archivedAt: true } },
} as const;

/** Un arrêt vivant : ni retiré, ni clos (C12). */
const LIVE_STOP = { removedAt: null, closedAt: null } as const;

/** Les bacs dans l'ordre de déclaration : c'est ce qui fait « bac 2 / 3 ». */
const DECLARATION_ORDER = [{ createdAt: "asc" }, { id: "asc" }] as const;

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
      transferId: true,
      transfer: { select: { siteLabel: true } },
      position: true,
      binLoads: { where: { loadedAt: { not: null } }, select: { binId: true, loadedAt: true } },
    },
  },
} as const;

interface BinRecord {
  readonly id: string;
  readonly orderId: string;
  readonly code: string;
  readonly voidedAt: Date | null;
  readonly half: string | null;
  readonly physicalBinId: string | null;
  readonly innerBags: number;
  readonly binType: {
    readonly id: string;
    readonly name: string;
    readonly isotherm: boolean;
    readonly archivedAt: Date | null;
  };
}

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
    const bins = await this.binsOf(orderIds);
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
        position: stop.position,
        bins: bins.filter((bin) => carriedBy(stop, carried).has(bin.orderId)),
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
    return this.binsOf([orderId]);
  }

  async bin(binId: string): Promise<BinRow | null> {
    const row = await this.prisma.deliveryBin.findUnique({
      where: { id: binId },
      select: BIN_SELECT,
    });
    if (row === null) {
      return null;
    }
    const [bin] = await this.withPartners([row]);
    return bin ?? null;
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

  async destinationOf(orderId: string, binId: string): Promise<BinDestinationRow | null> {
    // Sa propre tournée, ou celle du transfert interne qui l'emporte (lot T1).
    const stop = await this.prisma.deliveryRoundStop.findFirst({
      where: {
        ...LIVE_STOP,
        OR: [{ orderId }, { transfer: { items: { some: { kind: "order", orderId } } } }],
      },
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

  /** Les bacs de ces commandes, annulés compris, dans l'ordre de déclaration. */
  private async binsOf(orderIds: readonly string[]): Promise<BinRow[]> {
    if (orderIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.deliveryBin.findMany({
      where: { orderId: { in: [...orderIds] } },
      orderBy: [...DECLARATION_ORDER],
      select: BIN_SELECT,
    });
    return this.withPartners(rows);
  }

  /** Chaque bac, avec l'autre moitié vivante de son bac physique quand elle est à une autre commande. */
  private async withPartners(rows: readonly BinRecord[]): Promise<BinRow[]> {
    const physical = [...new Set(rows.flatMap((row) => row.physicalBinId ?? []))];
    const halves =
      physical.length === 0
        ? []
        : await this.prisma.deliveryBin.findMany({
            where: { physicalBinId: { in: physical }, voidedAt: null },
            select: { id: true, orderId: true, physicalBinId: true },
          });
    const partners = partnersOf(rows, halves);
    return rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      code: row.code,
      voidedAt: row.voidedAt,
      binType: {
        id: row.binType.id,
        name: row.binType.name,
        isotherm: row.binType.isotherm,
        archived: row.binType.archivedAt !== null,
      },
      half: binHalfOf(row.half),
      physicalBinId: row.physicalBinId,
      innerBags: row.innerBags,
      partner: partners.get(row.id) ?? null,
    }));
  }
}

/** Les commandes qu'un arrêt emporte : la sienne, ou celles de son transfert. */
function carriedBy(
  stop: { readonly orderId: string | null; readonly transferId: string | null },
  carried: ReadonlyMap<string, readonly string[]>,
): ReadonlySet<string> {
  if (stop.orderId !== null) {
    return new Set([stop.orderId]);
  }
  return new Set(stop.transferId === null ? [] : (carried.get(stop.transferId) ?? []));
}
