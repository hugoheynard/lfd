import { SetCatalogFeaturedCommand } from "../../b2b/catalog/application/commands/set-catalog-featured.command.js";
import type { ShopAudience } from "../../b2b/catalog/domain/ports/catalog.reader.js";
import { STILL_SOLD } from "../../b2b/catalog/infrastructure/sellable-filter.js";
import { asStaff, SEED_STAFF_SUB, type SeedContext } from "./order-placing.seed.js";

/**
 * **La mise en avant semée** (Hugo, 2026-10-19) : sans elle, les deux accueils
 * de la boutique s'ouvraient sans « Incontournables ». Des SKU de **produit**
 * pris aux paniers du corpus (`order-lines.seed.ts`) — publiés et commandables,
 * vérifiés avant tout semis par `ensureSkusExist` ; le croissant est des deux.
 */
export const FEATURED_SKUS: Readonly<Record<ShopAudience, readonly string[]>> = {
  public: ["VIE-001", "VIE-002", "VIE-005", "VIE-019"],
  pro: ["VIE-001", "PAI-001", "VIE-009", "PAI-013"],
};

/**
 * Met en avant chaque article de {@link FEATURED_SKUS} par la commande de
 * l'écran « Mise en avant ». Rejoué à chaque semis : un article déjà mis en
 * avant pour l'audience n'est pas réécrit.
 */
export async function featureSeededItems(context: SeedContext): Promise<void> {
  for (const audience of ["public", "pro"] as const) {
    const items = await context.prisma.catalogItem.findMany({
      where: { productSku: { in: [...FEATURED_SKUS[audience]] }, isDefault: true, ...STILL_SOLD },
      select: { sku: true, override: { select: { isFeaturedPro: true, isFeaturedPublic: true } } },
      orderBy: { sku: "asc" },
    });
    for (const item of items) {
      const already =
        audience === "pro" ? item.override?.isFeaturedPro : item.override?.isFeaturedPublic;
      if (already === true) {
        continue;
      }
      await asStaff(context.now, () =>
        context.commands.execute(
          new SetCatalogFeaturedCommand(item.sku, audience, true, SEED_STAFF_SUB),
        ),
      );
    }
  }
}
