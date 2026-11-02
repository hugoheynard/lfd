import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { PackingStock } from "../domain/entities/packing-stock.js";
import { PackingStockRepository } from "../domain/ports/packing-stock.repository.js";
import { assertInsideUnitOfWork, PackingStockVanishedError } from "./packing-lock.js";
import type { StockReservationSnapshot } from "../domain/services/stock-reservations.js";
import { newlyLifted, reservationsOn } from "./packing-stock-reservation.rows.js";

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
  /**
   * Les réservations telles que `lock` les a lues, par réserve chargée :
   * `save` n'écrit que ce qui a changé depuis (audit du réassort,
   * 2026-11-02). Faible : une réserve oubliée sort d'elle-même.
   */
  private readonly loaded = new WeakMap<PackingStock, readonly StockReservationSnapshot[]>();

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
    const stock = PackingStock.fromSnapshot({ serviceDay, sku, ...row, reservations });
    this.loaded.set(stock, reservations);
    return stock;
  }

  async save(stock: PackingStock): Promise<void> {
    await this.prisma.packingStock.update({
      where: { serviceDay_sku: { serviceDay: stock.serviceDay, sku: stock.sku } },
      data: { packed: stock.packed, returned: stock.returned, sentToShop: stock.sentToShop },
    });
    await this.saveReservations(stock);
  }

  /**
   * Inscrit les neuves, pose l'instant des levées NOUVELLES — un `UPDATE` par
   * instant de levée, d'ordinaire un seul. Une réserve qui n'a pas été
   * chargée par `lock` (aucun appelant, vérifié le 2026-11-02) est écrite en
   * entier : les deux écritures restent idempotentes.
   */
  private async saveReservations(stock: PackingStock): Promise<void> {
    const before = this.loaded.get(stock);
    const known = new Map(
      (before ?? []).map((reservation) => [reservation.resupplyId, reservation]),
    );
    const fresh = stock.reservations.filter((reservation) => !known.has(reservation.resupplyId));
    const day = { serviceDay: stock.serviceDay, sku: stock.sku };
    if (fresh.length > 0) {
      await this.prisma.packingStockReservation.createMany({
        data: fresh.map((reservation) => ({
          ...day,
          resupplyId: reservation.resupplyId,
          quantity: reservation.quantity,
          reservedAt: reservation.reservedAt,
        })),
        skipDuplicates: true,
      });
    }
    for (const { at, resupplyIds } of newlyLifted(stock.reservations, known)) {
      await this.prisma.packingStockReservation.updateMany({
        where: { ...day, resupplyId: { in: [...resupplyIds] }, releasedAt: null },
        data: { releasedAt: at },
      });
    }
    this.loaded.set(stock, stock.reservations);
  }
}
