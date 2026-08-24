import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import {
  LOCALES,
  SOURCE_LOCALE,
  type LocalizedText,
} from "../../shared/domain/value-objects/localized-text.js";
import {
  EditorialReader,
  type ProductEditorialView,
  type ProductMediaRecord,
} from "../domain/ports/editorial-reader.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Relit une colonne `jsonb` localisée — TOUTES ses langues ; `null` si absente
 * ou illisible.
 *
 * Elle ne rendait que le français, et n'importe quelle autre langue déjà en base
 * était donc invisible à l'application : ni affichable, ni modifiable, et
 * écrasée au premier enregistrement. Une colonne qu'on lit à moitié se perd en
 * silence.
 */
function localizedOf(value: unknown): LocalizedText | null {
  if (!isRecord(value)) {
    return null;
  }
  const source = value[SOURCE_LOCALE];
  if (typeof source !== "string" || source.trim() === "") {
    return null;
  }
  const text: Record<string, string> = {};
  for (const locale of LOCALES) {
    const raw = value[locale];
    if (typeof raw === "string" && raw.trim() !== "") {
      text[locale] = raw;
    }
  }
  return { ...text, [SOURCE_LOCALE]: source };
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
