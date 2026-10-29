import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { readLocalizedColumn } from "../../shared/infrastructure/json-readers.js";
import {
  DetachmentLineageReader,
  type LineageOrigin,
  type LineageProduct,
} from "../domain/ports/detachment-lineage.reader.js";

/** Les deux lectures de la filiation, sur `product` et `product_variant`. */
@Injectable()
export class PrismaDetachmentLineageReader extends DetachmentLineageReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async originOf(variantId: string): Promise<LineageOrigin | null> {
    const row = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: {
        sku: true,
        name: true,
        product: { select: { id: true, sku: true, name: true } },
      },
    });
    if (row === null) {
      return null;
    }
    return {
      productId: row.product.id,
      productSku: row.product.sku,
      productName: readLocalizedColumn(row.product.name, "product.name"),
      variantSku: row.sku,
      variantName: readLocalizedColumn(row.name, "variant.name"),
    };
  }

  async productsNamed(ids: readonly string[]): Promise<ReadonlyMap<string, LineageProduct>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.product.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, sku: true, name: true },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        {
          productId: row.id,
          productSku: row.sku,
          productName: readLocalizedColumn(row.name, "product.name"),
        },
      ]),
    );
  }
}
