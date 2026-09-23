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

    const images = await this.imagesByUrl(rows);
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

  /**
   * Les images citées, indexées par URL.
   *
   * 🔴 Une seconde requête plutôt qu'un `include`, et c'est le sujet : le
   * rattachement ne désigne plus une LIGNE d'actif mais une image, par son
   * URL. La relation Prisma disparaîtra au déploiement ③ avec la clé
   * étrangère, et un `include` cesserait alors de compiler — ici, il n'y en a
   * plus (`documentation/mediatheque/plan-la-mediatheque-bloc-a-part.md` §7).
   *
   * C'est aussi la forme que prendra le PORT, le jour où la bibliothèque sera
   * un bloc à elle : « donne-moi ces URL », et rien de plus.
   */
  private async imagesByUrl(
    rows: readonly { readonly mediaUrl: string | null }[],
  ): Promise<ReadonlyMap<string, Omit<ProductMediaRecord, "role">>> {
    const urls = [...new Set(rows.flatMap((row) => (row.mediaUrl === null ? [] : [row.mediaUrl])))];
    if (urls.length === 0) {
      return new Map();
    }
    const assets = await this.prisma.mediaAsset.findMany({
      where: { url: { in: urls } },
      select: {
        url: true,
        name: true,
        alt: true,
        width: true,
        height: true,
        bytes: true,
        contentType: true,
      },
    });
    return new Map(
      assets.map((asset) => [
        asset.url,
        {
          url: asset.url,
          name: asset.name,
          // L'alternative est stockée localisée, et relue telle quelle. Le repli
          // sur l'URL vaut mieux que la chaîne vide qu'on rendait : une
          // alternative absente doit se voir, pas se confondre avec une
          // alternative écrite.
          alt: localizedOf(asset.alt) ?? { [SOURCE_LOCALE]: asset.url },
          width: asset.width,
          height: asset.height,
          bytes: asset.bytes,
          contentType: asset.contentType,
        },
      ]),
    );
  }
}
