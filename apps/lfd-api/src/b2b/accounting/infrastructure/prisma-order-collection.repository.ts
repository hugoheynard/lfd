import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderCollection } from "../domain/entities/order-collection.js";
import { OrderCollectionRepository } from "../domain/ports/order-collection.repository.js";
import { Clock } from "../../../platform/time/clock.js";
import { billableOrderWhere } from "./billable-order-criterion.js";
import { orderCollectionColumns, toOrderCollectionState } from "./order-collection.mapper.js";

/** Adaptateur d'écriture des états d'encaissement — un `upsert` par commande. */
@Injectable()
export class PrismaOrderCollectionRepository extends OrderCollectionRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async load(orderId: string): Promise<OrderCollection | null> {
    const floor = await this.prisma.collectionFloor.findUnique({ where: { id: true } });
    if (floor === null) {
      return null;
    }
    const order = await this.prisma.order.findFirst({
      where: { ...billableOrderWhere(floor.floorAt, this.clock.now()), id: orderId },
      select: { id: true, totalCents: true },
    });
    if (order === null) {
      return null;
    }
    const row = await this.prisma.orderCollection.findUnique({ where: { orderId } });
    return row === null
      ? OrderCollection.due(order.id, order.totalCents, this.clock.now())
      : OrderCollection.rehydrate(toOrderCollectionState(row));
  }

  async ofBatch(batchId: string): Promise<readonly OrderCollection[]> {
    const rows = await this.prisma.orderCollection.findMany({
      where: { batchId },
      orderBy: { orderId: "asc" },
    });
    return rows.map((row) => OrderCollection.rehydrate(toOrderCollectionState(row)));
  }

  async ofLine(batchId: string, rank: number): Promise<readonly OrderCollection[]> {
    const rows = await this.prisma.orderCollection.findMany({
      where: { batchId, lineRank: rank },
      orderBy: { orderId: "asc" },
    });
    return rows.map((row) => OrderCollection.rehydrate(toOrderCollectionState(row)));
  }

  async saveAll(collections: readonly OrderCollection[]): Promise<void> {
    for (const collection of collections) {
      const state = collection.toPersistence();
      const columns = orderCollectionColumns(state);
      await this.prisma.orderCollection.upsert({
        where: { orderId: state.orderId },
        create: { orderId: state.orderId, ...columns },
        update: columns,
      });
    }
  }
}
