import type { PrismaService } from "../../../platform/database/prisma.service.js";
import type { CatalogItem } from "../domain/entities/catalog-item.js";

/** Un couple d'attentes, et les SKU qui le portent. */
interface ReviewGroup {
  readonly publicReviewPending: boolean;
  readonly proReviewPending: boolean;
  readonly skus: string[];
}

/**
 * Écrit l'attente de validation d'agrégats chargés, **groupée par couple
 * d'attentes** : au plus quatre `updateMany`, quel que soit le nombre
 * d'articles. Une écriture par article faisait expirer la transaction de
 * validation (P2028, 64 SKU, 2026-10-17).
 *
 * Seules les deux colonnes sont touchées : la validation ne change rien d'autre
 * (`CatalogItem.approveFor`), et les réécrire ne ferait qu'élargir la fenêtre
 * où un push concurrent verrait ses faits écrasés.
 */
export async function writeReviewStates(
  prisma: PrismaService,
  items: readonly CatalogItem[],
): Promise<void> {
  for (const group of groupByReview(items)) {
    await prisma.catalogItem.updateMany({
      where: { sku: { in: group.skus } },
      data: {
        publicReviewPending: group.publicReviewPending,
        proReviewPending: group.proReviewPending,
      },
    });
  }
}

function groupByReview(items: readonly CatalogItem[]): ReviewGroup[] {
  const groups = new Map<string, ReviewGroup>();
  for (const item of items) {
    const { publicReviewPending, proReviewPending } = item.toPersistence().placement;
    const key = `${String(publicReviewPending)}:${String(proReviewPending)}`;
    const group = groups.get(key) ?? { publicReviewPending, proReviewPending, skus: [] };
    group.skus.push(item.sku);
    groups.set(key, group);
  }
  return [...groups.values()];
}
