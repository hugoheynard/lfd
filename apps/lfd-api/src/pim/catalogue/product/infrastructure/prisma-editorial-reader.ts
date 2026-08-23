import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import {
  EditorialReader,
  type ProductEditorialView,
  type ProductMediaRecord,
} from "../domain/ports/editorial-reader.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Extrait le français d'une colonne `jsonb` localisée ; `null` si absent/illisible. */
function frOf(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const fr = value["fr"];
  return typeof fr === "string" ? fr : null;
}

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
    descriptionShort: frOf(row.descriptionShort),
    descriptionLong: frOf(row.descriptionLong),
    story: frOf(row.story),
    pairing: frOf(row.pairing),
    brand: row.brand,
    seoTitle: frOf(row.seoTitle),
    seoDescription: frOf(row.seoDescription),
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
      // L'alternative est stockée localisée ; le back-office est monolingue FR.
      alt: frOf(row.media.alt) ?? "",
      width: row.media.width,
      height: row.media.height,
      bytes: row.media.bytes,
      contentType: row.media.contentType,
    }));
  }
}
