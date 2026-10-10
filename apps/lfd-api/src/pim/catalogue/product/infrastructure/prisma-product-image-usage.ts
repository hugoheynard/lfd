import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { ProductImageUsage } from "../domain/ports/product-image-usage.js";

/** Les fiches qui portent une URL sous l'un des rôles demandés — `product_media` seul. */
@Injectable()
export class PrismaProductImageUsage extends ProductImageUsage {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async productsShowing(url: string, roles: readonly string[]): Promise<readonly string[]> {
    // Filtré en mémoire plutôt que par `role IN` : la colonne est un enum
    // Postgres, et une URL n'est portée que par une poignée de lignes.
    const rows = await this.prisma.productMedia.findMany({
      where: { mediaUrl: url },
      select: { productId: true, role: true },
    });
    const wanted = new Set(roles);
    return [...new Set(rows.filter((row) => wanted.has(row.role)).map((row) => row.productId))];
  }
}
