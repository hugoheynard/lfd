import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ProductNormStore, type ComputedProductNorm } from "../domain/ports/product-norm.store.js";

/** La forme d'une ligne d'agrégat, vue d'ici seulement. */
interface NormRow {
  readonly sku: string;
  readonly median: string | number;
  readonly lines: bigint | number;
}

/**
 * Le recalcul de la norme catalogue.
 *
 * La médiane est calculée **par Postgres** (`percentile_cont`) : rapatrier toutes
 * les lignes de six mois pour trier en mémoire serait absurde, et c'est
 * exactement ce que la base sait faire.
 *
 * Mêmes filtres que l'historique d'un compte — les commandes annulées n'ont
 * jamais été des achats, et une norme calculée sur des ventes annulées
 * mentirait. Les commandes zéro friction, elles, **comptent ici** : ce sont de
 * vraies quantités commandées, et la norme parle du produit, pas d'un compte.
 */
@Injectable()
export class PrismaProductNormStore extends ProductNormStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async compute(input: {
    readonly windowDays: number;
    readonly now: Date;
  }): Promise<ComputedProductNorm[]> {
    const since = new Date(input.now.getTime() - input.windowDays * DAY_MS);
    const rows = await this.prisma.$queryRaw<NormRow[]>`
      SELECT ol."sku" AS sku,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY ol."quantity") AS median,
             COUNT(*) AS lines
      FROM "order_lines" ol
      JOIN "orders" o ON o."id" = ol."order_id"
      WHERE o."status" <> 'cancelled'
        AND o."created_at" >= ${since}
      GROUP BY ol."sku"
    `;
    return rows.map((row) => ({
      sku: row.sku,
      medianQuantity: Number(row.median),
      sampleLines: Number(row.lines),
    }));
  }

  /**
   * Rlocation intégral, dans une transaction : un read-model dérivé n'a pas
   * d'état à préserver, mais il ne doit jamais être lu à moitié reconstruit — une
   * norme absente ferait taire la détection sans que personne ne le sache.
   */
  async replaceAll(
    norms: readonly ComputedProductNorm[],
    computedAt: Date,
    windowDays: number,
  ): Promise<number> {
    await this.prisma.$transaction([
      this.prisma.productNorm.deleteMany({}),
      this.prisma.productNorm.createMany({
        data: norms.map((norm) => ({
          sku: norm.sku,
          medianQuantity: norm.medianQuantity,
          sampleLines: norm.sampleLines,
          windowDays,
          computedAt,
        })),
      }),
    ]);
    return norms.length;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
