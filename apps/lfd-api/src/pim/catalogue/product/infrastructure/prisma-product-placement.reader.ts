import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import {
  ProductPlacementReader,
  type ProductPlacement,
} from "../domain/ports/product-placement.reader.js";

/** L'adaptateur : la fiche, ses dérogations et ses références, en une requête. */
@Injectable()
export class PrismaProductPlacementReader extends ProductPlacementReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async placementOf(productId: string): Promise<ProductPlacement | null> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        categoryId: true,
        contextVat: { select: { contextId: true, vatRateId: true } },
        variants: { select: { sku: true } },
      },
    });
    if (product === null) {
      return null;
    }
    return {
      productId: product.id,
      categoryId: product.categoryId,
      vatByContext: Object.fromEntries(
        product.contextVat.map((row) => [row.contextId, row.vatRateId] as const),
      ),
      variantSkus: product.variants.map((variant) => variant.sku),
    };
  }
}
