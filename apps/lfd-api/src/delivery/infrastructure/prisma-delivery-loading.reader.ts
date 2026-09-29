import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  type BagDestinationRow,
  type BagRow,
  DeliveryLoadingReader,
  type LoadingRoundRow,
} from "../domain/ports/delivery-loading.reader.js";

const BAG_SELECT = { id: true, orderId: true, code: true, voidedAt: true } as const;

/** Un arrêt vivant : ni retiré, ni clos (C12). */
const LIVE_STOP = { removedAt: null, closedAt: null } as const;

/** Les sacs dans l'ordre de déclaration : c'est ce qui fait « sac 2 / 3 ». */
const DECLARATION_ORDER = [{ createdAt: "asc" }, { id: "asc" }] as const;

/** Une tournée, ses arrêts vivants, et les sacs CHARGÉS dans chacun. */
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
      orderId: true,
      position: true,
      bagLoads: { where: { loadedAt: { not: null } }, select: { bagId: true, loadedAt: true } },
    },
  },
} as const;

/**
 * **Adaptateur Prisma des lectures du chargement** (lot 4). Il ne verrouille
 * rien et n'écrit rien : ouvrir un QR, imprimer ou regarder un véhicule ne
 * change pas le chargement.
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

  /** Deux lectures quel que soit le nombre de tournées : les tournées, puis les sacs. */
  private async readRounds(
    where: { readonly id: string } | { readonly serviceDay: string },
  ): Promise<LoadingRoundRow[]> {
    const rounds = await this.prisma.deliveryRound.findMany({
      where,
      orderBy: [{ vehicle: { createdAt: "asc" } }, { vehicleId: "asc" }, { passage: "asc" }],
      select: ROUND_SELECT,
    });
    const orderIds = rounds.flatMap((round) => round.stops.map((stop) => stop.orderId));
    const bags =
      orderIds.length === 0
        ? []
        : await this.prisma.deliveryBag.findMany({
            where: { orderId: { in: orderIds } },
            orderBy: [...DECLARATION_ORDER],
            select: BAG_SELECT,
          });
    return rounds.map((round) => ({
      id: round.id,
      serviceDay: round.serviceDay,
      vehicleName: round.vehicleName,
      passage: round.passage,
      version: round.version,
      departedAt: round.departedAt,
      stops: round.stops.map((stop) => ({
        stopId: stop.id,
        orderId: stop.orderId,
        position: stop.position,
        bags: bags.filter((bag) => bag.orderId === stop.orderId),
        loaded: new Map(
          stop.bagLoads.flatMap((load) =>
            load.loadedAt === null ? [] : [[load.bagId, load.loadedAt] as const],
          ),
        ),
      })),
    }));
  }

  orderBags(orderId: string): Promise<readonly BagRow[]> {
    return this.prisma.deliveryBag.findMany({
      where: { orderId },
      orderBy: [...DECLARATION_ORDER],
      select: BAG_SELECT,
    });
  }

  bag(bagId: string): Promise<BagRow | null> {
    return this.prisma.deliveryBag.findUnique({ where: { id: bagId }, select: BAG_SELECT });
  }

  async destinationOf(orderId: string, bagId: string): Promise<BagDestinationRow | null> {
    const stop = await this.prisma.deliveryRoundStop.findFirst({
      where: { orderId, ...LIVE_STOP },
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
        bagLoads: { where: { bagId }, select: { loadedAt: true } },
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
      loadedAt: stop.bagLoads[0]?.loadedAt ?? null,
    };
  }
}
