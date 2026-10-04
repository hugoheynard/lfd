import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { PackingStock } from "../domain/entities/packing-stock.js";
import { PackingStockRepository } from "../domain/ports/packing-stock.repository.js";
import { assertInsideUnitOfWork, PackingStockVanishedError } from "./packing-lock.js";

/** Les compteurs d'une réserve, tels que `FOR UPDATE` les rend. */
interface StockRow {
  readonly received: number;
  readonly returned: number;
  readonly packed: number;
}

/**
 * L'adaptateur Prisma de la réserve `(jour, SKU)` — la ligne verrouillée.
 *
 * `lock` crée la ligne vide si besoin (`ON CONFLICT DO NOTHING`), puis la lit
 * `FOR UPDATE`. Une remise qui arrive pendant le verrou attend son `COMMIT`,
 * puis ajoute à `received` en incrément : `save` n'écrit donc que `packed` et
 * `returned`, les deux compteurs que l'agrégat change.
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
      SELECT "received", "returned", "packed" FROM "packing"."packing_stock"
       WHERE "service_day" = ${serviceDay} AND "sku" = ${sku}
         FOR UPDATE`;
    const row = rows[0];
    if (row === undefined) {
      // Elle vient d'être posée dans la même transaction : rien ne la retire.
      throw new PackingStockVanishedError(serviceDay, sku);
    }
    return PackingStock.fromSnapshot({ serviceDay, sku, ...row });
  }

  async save(stock: PackingStock): Promise<void> {
    await this.prisma.packingStock.update({
      where: { serviceDay_sku: { serviceDay: stock.serviceDay, sku: stock.sku } },
      data: { packed: stock.packed, returned: stock.returned },
    });
  }
}
