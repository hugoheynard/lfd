import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { SOURCE_LOCALE } from "../../shared/domain/value-objects/localized-text.js";
import { optionalLocalizedColumn as localizedOf } from "../../shared/infrastructure/json-readers.js";
import {
  EditorialReader,
  type ProductEditorialView,
  type ProductMediaRecord,
} from "../domain/ports/editorial-reader.js";

/** Ligne `product_editorial` → vue à plat. Les textes sont localisés, la vue non. */
function viewOf(row: {
  descriptionShort: unknown;
  descriptionLong: unknown;
  story: unknown;
  pairing: unknown;
  brand: string | null;
  seoTitle: unknown;
  seoDescription: unknown;
}): ProductEditorialView {
  return {
    descriptionShort: localizedOf(row.descriptionShort),
    descriptionLong: localizedOf(row.descriptionLong),
    story: localizedOf(row.story),
    pairing: localizedOf(row.pairing),
    brand: row.brand,
    seoTitle: localizedOf(row.seoTitle),
    seoDescription: localizedOf(row.seoDescription),
  };
}

@Injectable()
export class PrismaEditorialReader extends EditorialReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async findByProduct(productId: string): Promise<ProductEditorialView | null> {
    const row = await this.prisma.productEditorial.findUnique({
      where: { productId },
    });
    return row === null ? null : viewOf(row);
  }

  async findByProducts(
    productIds: readonly string[],
  ): Promise<ReadonlyMap<string, ProductEditorialView>> {
    if (productIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.productEditorial.findMany({
      where: { productId: { in: [...productIds] } },
    });
    return new Map(rows.map((row) => [row.productId, viewOf(row)]));
  }

  async mediaOf(productId: string): Promise<readonly ProductMediaRecord[]> {
    const rows = await this.prisma.productMedia.findMany({
      where: { productId },
      orderBy: { position: "asc" },
      include: { media: true },
    });
    return rows.map((row) => ({
      role: row.role,
      url: row.media.url,
      name: row.media.name,
      // L'alternative est stockée localisée, et relue telle quelle. Le repli sur
      // l'URL vaut mieux que la chaîne vide qu'on rendait : une alternative
      // absente doit se voir, pas se confondre avec une alternative écrite.
      alt: localizedOf(row.media.alt) ?? { [SOURCE_LOCALE]: row.media.url },
      width: row.media.width,
      height: row.media.height,
      bytes: row.media.bytes,
      contentType: row.media.contentType,
    }));
  }
}
