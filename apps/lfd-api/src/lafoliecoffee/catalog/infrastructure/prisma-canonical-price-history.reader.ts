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
   * `distinct` sur l'ARTICLE (`sku`, la référence de vente depuis la bascule —
   * `plan-defaut-sous-sa-reference.md`, L3) — trié par date décroissante :
   * Postgres le rend en `DISTINCT ON`, donc une seule ligne par article
   * **dans la requête**. Rapatrier tout l'historique pour n'en garder
   * que la dernière ligne coûterait de plus en plus cher pour un résultat de
   * taille constante, et la table ne fait que grandir.
   */
  async pricingAt(at: Date): Promise<ReadonlyMap<string, CatalogPricing>> {
    const rows = await this.prisma.catalogPriceHistory.findMany({
      where: { recordedAt: { lte: at } },
      orderBy: [{ sku: "asc" }, { recordedAt: "desc" }],
      distinct: ["sku"],
      select: { sku: true, priceMillicents: true, vatRatePercent: true },
    });
    return new Map(
      rows.map((row) => [
        row.sku,
        {
          sku: row.sku,
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
