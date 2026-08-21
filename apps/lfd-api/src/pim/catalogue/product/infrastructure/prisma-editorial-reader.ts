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

@Injectable()
export class PrismaEditorialReader extends EditorialReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async findByProduct(productId: string): Promise<ProductEditorialView | null> {
    const row = await this.prisma.productEditorial.findUnique({
      where: { productId },
    });
    if (row === null) {
      return null;
    }
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
    }));
  }
}
