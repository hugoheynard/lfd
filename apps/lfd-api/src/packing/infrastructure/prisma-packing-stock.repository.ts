import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { PackingStock } from "../domain/entities/packing-stock.js";
import { PackingStockRepository } from "../domain/ports/packing-stock.repository.js";
import { assertInsideUnitOfWork, PackingStockVanishedError } from "./packing-lock.js";
import { reservationsOn } from "./packing-stock-reservation.rows.js";

/** Les compteurs d'une réserve, tels que `FOR UPDATE` les rend. */
interface StockRow {
  readonly received: number;
  readonly returned: number;
  readonly packed: number;
  readonly sentToShop: number;
}

/**
 * L'adaptateur Prisma de la réserve `(jour, SKU)` — la ligne verrouillée.
 *
 * `lock` crée la ligne vide si besoin (`ON CONFLICT DO NOTHING`), puis la lit
 * `FOR UPDATE`. Une remise qui arrive pendant le verrou attend son `COMMIT`,
 * puis ajoute à `received` en incrément : `save` n'écrit donc que `packed`,
 * `returned` et `sentToShop` (A1.4), les compteurs que l'agrégat change — et les réservations
 * des réassorts lancés (R4b) : une neuve s'insère, une levée prend son
 * instant. Leur reste dû n'est pas écrit : il se déduit de la ligne.
 */
@Injectable()
export class PrismaPackingStockRepository extends PackingStockRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lock(serviceDay: string, sku: string): Promise<PackingStock> {
    assertInsideUnitOfWork(`de la réserve « ${sku} » (${serviceDay})`);
    await this.prisma.$executeRaw`
      INSERT INTO "packing"."packing_stock" ("service_day", "sku")
      VALUES (${serviceDay}, ${sku})
      ON CONFLICT ("service_day", "sku") DO NOTHING`;
    const rows = await this.prisma.$queryRaw<StockRow[]>`
      SELECT "received", "returned", "packed", "sent_to_shop" AS "sentToShop" FROM "packing"."packing_stock"
       WHERE "service_day" = ${serviceDay} AND "sku" = ${sku}
         FOR UPDATE`;
    const row = rows[0];
    if (row === undefined) {
      // Elle vient d'être posée dans la même transaction : rien ne la retire.
      throw new PackingStockVanishedError(serviceDay, sku);
    }
    // Après le verrou, jamais avant (cf. `reservationsOn`).
    const reservations = (await reservationsOn(this.prisma, serviceDay, sku)).get(sku) ?? [];
    return PackingStock.fromSnapshot({ serviceDay, sku, ...row, reservations });
  }

  async save(stock: PackingStock): Promise<void> {
    await this.prisma.packingStock.update({
      where: { serviceDay_sku: { serviceDay: stock.serviceDay, sku: stock.sku } },
      data: { packed: stock.packed, returned: stock.returned, sentToShop: stock.sentToShop },
    });
    await this.saveReservations(stock);
  }

  /** Inscrit les neuves (une existante reste), pose la levée des levées. */
  private async saveReservations(stock: PackingStock): Promise<void> {
    if (stock.reservations.length === 0) {
      return;
    }
    const day = { serviceDay: stock.serviceDay, sku: stock.sku };
    await this.prisma.packingStockReservation.createMany({
      data: stock.reservations.map((reservation) => ({
        ...day,
        resupplyId: reservation.resupplyId,
        quantity: reservation.quantity,
        reservedAt: reservation.reservedAt,
      })),
      skipDuplicates: true,
    });
    for (const reservation of stock.reservations) {
      if (reservation.releasedAt !== null) {
        await this.prisma.packingStockReservation.updateMany({
          where: { ...day, resupplyId: reservation.resupplyId, releasedAt: null },
          data: { releasedAt: reservation.releasedAt },
        });
      }
    }
  }
}
