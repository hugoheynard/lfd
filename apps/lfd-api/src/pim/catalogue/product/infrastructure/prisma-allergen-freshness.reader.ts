import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { AllergenFreshnessReader } from "../domain/ports/allergen-freshness.reader.js";

/**
 * Trois agrégats `max` et non une relecture des lignes : la date est un
 * maximum, la base le calcule. Pas de déclinaison archivée à écarter — une
 * déclinaison n'en a pas.
 */
@Injectable()
export class PrismaAllergenFreshnessReader extends AllergenFreshnessReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async lastModifiedAt(productIds: readonly string[]): Promise<Date | null> {
    if (productIds.length === 0) {
      return null;
    }
    const ids = [...productIds];
    const [products, variants, sheets] = await Promise.all([
      this.prisma.product.aggregate({ where: { id: { in: ids } }, _max: { updatedAt: true } }),
      this.prisma.productVariant.aggregate({
        where: { productId: { in: ids } },
        _max: { updatedAt: true },
      }),
      this.prisma.variantAllergens.aggregate({
        where: { variant: { productId: { in: ids } } },
        _max: { updatedAt: true },
      }),
    ]);
    const dates = [products._max.updatedAt, variants._max.updatedAt, sheets._max.updatedAt].filter(
      (date): date is Date => date !== null,
    );
    return dates.reduce<Date | null>(
      (latest, date) => (latest === null || date > latest ? date : latest),
      null,
    );
  }
}
