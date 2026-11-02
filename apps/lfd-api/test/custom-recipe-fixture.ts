import type { E2eContext } from "./e2e-harness.js";

/**
 * **Pose « sur mesure » sur un article du catalogue semé**, comme un fait v17
 * du référentiel le pose : sur TOUTES les déclinaisons de sa fiche
 * (`documentation/catalogue/plan-articles-sur-mesure.md` § 13, D1).
 *
 * Depuis R3-1 (2026-11-02), le commerce ne pose plus ce fait : la route
 * `PUT /admin/catalog/:sku/made-to-order` est retirée, et la seule écriture de
 * `catalog_items.custom_recipe` est la projection des faits de fiche. Le
 * catalogue du harnais est semé sans fiche au référentiel (`catalog-fixture.ts`) :
 * cette aide écrit donc la colonne comme la projection l'écrit. La chaîne
 * entière — case de la fiche, journal, fait, colonne, mur — est éprouvée par
 * `catalog-custom-recipe.e2e-spec.ts`.
 *
 * Ce n'est pas une suite (`.ts`) : `lint:e2e-durations` ne la mesure pas.
 */
export async function markCustomRecipe(
  ctx: E2eContext,
  sku: string,
  customRecipe = true,
): Promise<void> {
  const { productId } = await ctx.prisma.catalogItem.findUniqueOrThrow({
    where: { sku },
    select: { productId: true },
  });
  await ctx.prisma.catalogItem.updateMany({ where: { productId }, data: { customRecipe } });
}
