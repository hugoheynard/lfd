import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  PackingStationReader,
  type StationContainer,
  type StationDay,
} from "../../production/channels/packing/index.js";
import { BinDesk } from "../channels/delivery/index.js";
import type { PackingContainerState } from "../domain/entities/order-contents.js";
import { citeContainer } from "../domain/events/packing-container.events.js";
import { CONTAINER_SELECT, containerModeOf, containerOf } from "./packing-container.mapper.js";

/**
 * Le poste de colisage d'une journée, en lecture — les bacs, leurs lignes,
 * leurs contenants et les réserves. Implémente le port que le fournil déclare.
 *
 * Défense en profondeur (K2b, §5.1, B1) : un contenant dont le bac n'est plus
 * vivant chez la livraison n'est ni servi, ni compté — même si son annulation
 * a échappé au colisage.
 */
@Injectable()
export class PrismaPackingStationReader extends PackingStationReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly desk: BinDesk,
  ) {
    super();
  }

  async dayOf(serviceDay: string): Promise<StationDay> {
    const [orders, stocks] = await Promise.all([
      this.prisma.packingOrder.findMany({
        where: { serviceDay },
        select: {
          orderId: true,
          packedAt: true,
          packedBy: true,
          containerCount: true,
          containerMode: true,
          containers: CONTAINER_SELECT,
          lines: {
            select: { sku: true, packedAt: true, packedBy: true, packedInitials: true },
          },
        },
      }),
      this.prisma.packingStock.findMany({
        where: { serviceDay },
        select: { sku: true, received: true, returned: true, packed: true },
      }),
    ]);
    const liveBins = await this.desk.liveBins(
      orders.flatMap((order) => order.containers.flatMap((row) => row.binId ?? [])),
    );
    return {
      orders: orders.map((order) => {
        const mode = containerModeOf(order.containerMode);
        const all = order.containers.map(containerOf);
        const live = all.filter((container) => isLive(container, liveBins));
        return {
          orderId: order.orderId,
          packed:
            order.packedAt === null || order.packedBy === null
              ? null
              : { at: order.packedAt, by: order.packedBy },
          containers: mode === "listed" ? live.length : order.containerCount,
          lines: order.lines.map((line) => ({
            sku: line.sku,
            packed:
              line.packedAt === null || line.packedBy === null
                ? null
                : { at: line.packedAt, by: line.packedBy, initials: line.packedInitials },
          })),
          containerMode: mode,
          containerList: live.map((container) => stationContainerOf(container, all)),
        };
      }),
      stocks,
    };
  }
}

function isLive(container: PackingContainerState, liveBins: ReadonlySet<string>): boolean {
  return container.voided === null && (container.bin === null || liveBins.has(container.bin.binId));
}

function stationContainerOf(
  container: PackingContainerState,
  all: readonly PackingContainerState[],
): StationContainer {
  return {
    id: container.id,
    nature: container.nature,
    label: citeContainer(all, container.id).name,
    bin: container.bin,
    lines: container.lines.filter((line) => line.quantity > 0),
  };
}
