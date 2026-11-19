import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import type { Product } from "../domain/entities/product.js";
import { AllProductsReader } from "../domain/ports/all-products.reader.js";
import { PRODUCT_INCLUDE, toProduct } from "./prisma-product.repository.js";

/**
 * L'adaptateur : la requête et le mapper du dépôt des fiches, pour qu'une
 * fiche se relise de la même façon qu'on la lise ou qu'on l'écrive —
 * déclinaisons alignées comprises.
 */
@Injectable()
export class PrismaAllProductsReader extends AllProductsReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async all(): Promise<Product[]> {
    const rows = await this.prisma.product.findMany({
      include: PRODUCT_INCLUDE,
      orderBy: { sku: "asc" },
    });
    return rows.map(toProduct);
  }
}
