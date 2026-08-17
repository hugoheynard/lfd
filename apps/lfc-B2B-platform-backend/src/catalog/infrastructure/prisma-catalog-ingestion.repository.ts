import { Injectable } from "@nestjs/common";
import type { CatalogSnapshot } from "@lfd/catalog-sync";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { CatalogIngestionRepository, type IngestionOutcome } from "../domain/catalog.repository.js";

/**
 * Applique un snapshot du PIM, **sans jamais faire table rase**.
 *
 * Tout se joue dans une transaction : un catalogue à moitié écrit vend des
 * articles à des prix qui n'ont jamais été décidés ensemble.
 */
@Injectable()
export class PrismaCatalogIngestionRepository extends CatalogIngestionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async apply(snapshot: CatalogSnapshot): Promise<IngestionOutcome> {
    const receivedAt = new Date(snapshot.generatedAt);
    const items = snapshot.products.flatMap((product) =>
      product.variants.map((variant) => ({ product, variant })),
    );
    const incomingSkus = new Set(items.map(({ variant }) => variant.sku));

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.catalogItem.findMany({ select: { sku: true } });
      const removedSkus = existing.map((row) => row.sku).filter((sku) => !incomingSkus.has(sku));

      // Les familles d'abord : les articles y font référence.
      for (const category of snapshot.categories) {
        const row = {
          name: category.name,
          slug: category.slug,
          parentId: category.parentId,
          position: category.position,
          vatRatePercent: category.vatRatePercent,
          receivedAt,
        };
        await tx.catalogCategory.upsert({
          where: { id: category.id },
          create: { id: category.id, ...row },
          update: row,
        });
      }

      // Puis les articles — `upsert`, jamais `delete` + `create` : la décision
      // locale (prix B2B, visibilité) cascade depuis l'article, et la recréer
      // effacerait tout le travail commercial en silence.
      for (const { product, variant } of items) {
        const row = {
          productId: product.id,
          productSku: product.sku,
          name: variant.name,
          kind: product.kind,
          categoryId: product.categoryId,
          priceCents: variant.priceCents,
          weightGrams: variant.weightGrams,
          isDefault: variant.isDefault,
          position: variant.position,
          receivedAt,
        };
        await tx.catalogItem.upsert({
          where: { sku: variant.sku },
          create: { sku: variant.sku, ...row },
          update: row,
        });
      }

      // Enfin les retraits : ceux-là emportent leur décision, et c'est juste —
      // un prix négocié ne veut plus rien dire sans l'article qu'il tarifait.
      if (removedSkus.length > 0) {
        await tx.catalogItem.deleteMany({ where: { sku: { in: removedSkus } } });
      }

      return {
        acceptedProducts: snapshot.products.length,
        acceptedVariants: items.length,
        acceptedCategories: snapshot.categories.length,
        removedSkus,
      };
    });
  }
}
