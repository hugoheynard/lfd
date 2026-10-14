import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  type OrderDeparture,
  OrderDeparturesReader,
} from "../../packing/channels/delivery/index.js";
import { ORDER_STOP, orderStopsOnly } from "./order-stop.js";

/** Ce que l'adaptateur lit d'une tournée pour en dire le départ. */
interface RoundTimes {
  readonly plannedDepartureAt: Date | null;
  readonly departedAt: Date | null;
}

/** Le départ d'une tournée : prévu, sinon réel ; `null` : ni l'un ni l'autre. */
function departureOf(round: RoundTimes): { readonly at: Date; readonly departed: boolean } | null {
  const at = round.plannedDepartureAt ?? round.departedAt;
  return at === null ? null : { at, departed: round.departedAt !== null };
}

/**
 * **Le départ des commandes, lu par la livraison pour le colisage** (lot L2,
 * 2026-10-14) — l'adaptateur de `OrderDeparturesReader`.
 *
 * Deux lectures par lot, toutes deux dans les tables de la livraison :
 *
 * - l'arrêt VIVANT d'une livraison et sa tournée — le plus récent quand une
 *   commande rapportée a été replacée ;
 * - l'élément vivant d'un transfert interne (un retrait vers un site servi par
 *   transfert), puis la tournée qui porte l'arrêt de ce transfert ; à défaut
 *   d'arrêt, le départ réel du transfert lui-même.
 */
@Injectable()
export class PrismaOrderDeparturesReader extends OrderDeparturesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async departuresOf(orderIds: readonly string[]): Promise<readonly OrderDeparture[]> {
    if (orderIds.length === 0) {
      return [];
    }
    const [byStop, byTransfer] = await Promise.all([
      this.deliveries(orderIds),
      this.transfers(orderIds),
    ]);
    const found = new Map<string, OrderDeparture>([...byTransfer, ...byStop]);
    return [...found.values()];
  }

  private async deliveries(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, OrderDeparture>> {
    const stops = orderStopsOnly(
      await this.prisma.deliveryRoundStop.findMany({
        where: { orderId: { in: [...orderIds] }, ...ORDER_STOP, removedAt: null },
        // Le plus récent gagne : il est écrit en dernier dans la carte.
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          orderId: true,
          round: { select: { plannedDepartureAt: true, departedAt: true } },
        },
      }),
    );
    const found = new Map<string, OrderDeparture>();
    for (const stop of stops) {
      const departure = departureOf(stop.round);
      if (departure !== null) {
        found.set(stop.orderId, { orderId: stop.orderId, via: "delivery", ...departure });
      }
    }
    return found;
  }

  private async transfers(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, OrderDeparture>> {
    const items = await this.prisma.deliveryInternalTransferItem.findMany({
      where: { orderId: { in: [...orderIds] }, kind: "order", detachedAt: null },
      orderBy: [{ attachedAt: "asc" }, { id: "asc" }],
      select: {
        orderId: true,
        transfer: {
          select: {
            departedAt: true,
            stops: {
              where: { removedAt: null },
              orderBy: [{ createdAt: "desc" }, { id: "asc" }],
              take: 1,
              select: { round: { select: { plannedDepartureAt: true, departedAt: true } } },
            },
          },
        },
      },
    });
    const found = new Map<string, OrderDeparture>();
    for (const item of items) {
      const round = item.transfer.stops[0]?.round;
      const departure =
        (round === undefined ? null : departureOf(round)) ??
        departureOf({ plannedDepartureAt: null, departedAt: item.transfer.departedAt });
      if (item.orderId !== null && departure !== null) {
        found.set(item.orderId, { orderId: item.orderId, via: "transfer", ...departure });
      }
    }
    return found;
  }
}
