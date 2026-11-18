import type { E2eContext } from "./e2e-harness.js";

/**
 * **Pose « sur mesure » sur un article du catalogue semé**, comme un fait v18
 * du référentiel le pose : sur la déclinaison de CE SKU seule
 * (`documentation/catalogue/plan-sur-mesure-par-declinaison.md`, V1).
 *
 * La seule écriture de `catalog_items.custom_recipe` est la projection des
 * faits de fiche. Le catalogue du harnais est semé sans fiche au référentiel
 * (`catalog-fixture.ts`) : cette aide écrit donc la colonne comme la projection
 * l'écrit. La chaîne entière — case de la déclinaison, journal, fait, colonne,
 * mur — est éprouvée par `catalog-custom-recipe.e2e-spec.ts`.
 *
 * Ce n'est pas une suite (`.ts`) : `lint:e2e-durations` ne la mesure pas.
 */
export async function markCustomRecipe(
  ctx: E2eContext,
  sku: string,
  customRecipe = true,
): Promise<void> {
  await ctx.prisma.catalogItem.update({ where: { sku }, data: { customRecipe } });
}
