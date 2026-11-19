import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { ProductTalliesReader, type ProductTally } from "../domain/ports/product-tallies.reader.js";

/** L'adaptateur : le NOMBRE des déclinaisons et la présence d'une signature, compté en base. */
@Injectable()
export class PrismaProductTalliesReader extends ProductTalliesReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async tallies(): Promise<readonly ProductTally[]> {
    const products = await this.prisma.product.findMany({
      select: {
        id: true,
        status: true,
        categoryId: true,
        readiness: { select: { productId: true } },
        _count: { select: { variants: true } },
      },
    });
    return products.map((product) => ({
      productId: product.id,
      status: product.status,
      categoryId: product.categoryId,
      articles: product._count.variants,
      signed: product.readiness !== null,
    }));
  }
}
