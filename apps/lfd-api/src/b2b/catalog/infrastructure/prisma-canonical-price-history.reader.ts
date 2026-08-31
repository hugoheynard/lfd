import { Injectable } from "@nestjs/common";
import type { CatalogPricing } from "@lfd/contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CanonicalPriceHistoryReader } from "../domain/ports/canonical-price-history.reader.js";

@Injectable()
export class PrismaCanonicalPriceHistoryReader extends CanonicalPriceHistoryReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * `distinct` sur le PRODUIT — l'unité que la plateforme vend — trié par date
   * décroissante : Postgres le rend en `DISTINCT ON`, donc une seule ligne par
   * produit **dans la requête**. Rapatrier tout l'historique pour n'en garder
   * que la dernière ligne coûterait de plus en plus cher pour un résultat de
   * taille constante, et la table ne fait que grandir.
   */
  async pricingAt(at: Date): Promise<ReadonlyMap<string, CatalogPricing>> {
    const rows = await this.prisma.catalogPriceHistory.findMany({
      where: { recordedAt: { lte: at } },
      orderBy: [{ productSku: "asc" }, { recordedAt: "desc" }],
      distinct: ["productSku"],
      select: { productSku: true, priceMillicents: true, vatRatePercent: true },
    });
    return new Map(
      rows.map((row) => [
        row.productSku,
        {
          sku: row.productSku,
          unitPriceMillicents: row.priceMillicents,
          // `Decimal` → `number` : le domaine ne connaît pas le type de l'ORM.
          vatRatePercent: row.vatRatePercent === null ? null : row.vatRatePercent.toNumber(),
        },
      ]),
    );
  }

  async startsAt(): Promise<Date | null> {
    const first = await this.prisma.catalogPriceHistory.findFirst({
      orderBy: { recordedAt: "asc" },
      select: { recordedAt: true },
    });
    return first?.recordedAt ?? null;
  }
}
