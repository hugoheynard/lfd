import { Injectable } from "@nestjs/common";

import { optionalLocalizedColumn as localizedOf } from "../../shared/infrastructure/json-readers.js";
import { ImageCatalogue } from "../../../channels/media/image-catalogue.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
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
  constructor(
    private readonly prisma: PimPrismaService,
    // 🔴 La bibliothèque répond par un PORT : le référentiel ne possède pas la
    // table des images, il en cite des URL et demande qu'on les lui décrive.
    private readonly images: ImageCatalogue,
  ) {
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
    return (await this.mediaOfProducts([productId])).get(productId) ?? [];
  }

  async mediaOfProducts(
    productIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly ProductMediaRecord[]>> {
    if (productIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.productMedia.findMany({
      where: { productId: { in: [...productIds] } },
      orderBy: { position: "asc" },
      select: { productId: true, role: true, mediaUrl: true },
    });

    const images = await this.images.describe(
      rows.flatMap((row) => (row.mediaUrl === null ? [] : [row.mediaUrl])),
    );
    const byProduct = new Map<string, ProductMediaRecord[]>();
    for (const row of rows) {
      const image = row.mediaUrl === null ? undefined : images.get(row.mediaUrl);
      if (image === undefined) {
        // Un rattachement sans image n'est pas rendu. Il ne peut naître que
        // d'une ligne antérieure au report de l'URL (déploiement ①) ; la taire
        // vaut mieux qu'un visuel cassé sur une fiche publiée.
        continue;
      }
      const bucket = byProduct.get(row.productId);
      if (bucket === undefined) {
        byProduct.set(row.productId, [{ ...image, role: row.role }]);
      } else {
        bucket.push({ ...image, role: row.role });
      }
    }
    return byProduct;
  }
}
