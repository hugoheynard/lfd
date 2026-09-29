import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { DeliveryBag } from "../domain/entities/delivery-bag.js";
import { BagCodeCollisionError } from "../domain/errors/delivery-loading-errors.js";
import { DeliveryBagRepository } from "../domain/ports/delivery-bag.repository.js";

/** Code Prisma d'une violation d'unicité : l'index des codes de sac. */
const UNIQUE_VIOLATION = "P2002";

/** Ce que l'adaptateur relit d'un sac. */
const BAG_SELECT = {
  id: true,
  orderId: true,
  code: true,
  voidedAt: true,
  createdAt: true,
} as const;

/**
 * **Adaptateur Prisma des sacs** (lot 4). Écrivain de `delivery_bag` : le
 * chargement. Il écrit `id`, `order_id`, `code`, `created_at` à la
 * déclaration, puis `voided_at` seul. Aucune ligne n'est supprimée.
 */
@Injectable()
export class PrismaDeliveryBagRepository extends DeliveryBagRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(bagId: string): Promise<DeliveryBag | null> {
    const row = await this.prisma.deliveryBag.findUnique({
      where: { id: bagId },
      select: BAG_SELECT,
    });
    return row === null ? null : DeliveryBag.restore(row);
  }

  async findByCode(code: string): Promise<DeliveryBag | null> {
    const row = await this.prisma.deliveryBag.findUnique({ where: { code }, select: BAG_SELECT });
    return row === null ? null : DeliveryBag.restore(row);
  }

  async codesTaken(codes: readonly string[]): Promise<ReadonlySet<string>> {
    if (codes.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.deliveryBag.findMany({
      where: { code: { in: [...codes] } },
      select: { code: true },
    });
    return new Set(rows.map((row) => row.code));
  }

  /**
   * Le tirage a déjà écarté les codes pris ; une violation d'unicité ici est
   * une course entre deux déclarations simultanées — la transaction est
   * perdue, on ne peut pas retirer : le refus le dit.
   */
  async declare(bags: readonly DeliveryBag[]): Promise<void> {
    try {
      await this.prisma.deliveryBag.createMany({
        data: bags.map((bag) => bag.toSnapshot()),
      });
    } catch (error: unknown) {
      if (error instanceof Error && Reflect.get(error, "code") === UNIQUE_VIOLATION) {
        throw new BagCodeCollisionError();
      }
      throw error;
    }
  }

  async save(bag: DeliveryBag): Promise<void> {
    await this.prisma.deliveryBag.update({
      where: { id: bag.id },
      data: { voidedAt: bag.voidedAt },
    });
  }
}
