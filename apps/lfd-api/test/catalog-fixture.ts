import { millicentsFromCents } from "@lfd/money";
import { CATALOG_SEED } from "./catalog-seed.js";
import type { PrismaService } from "../src/platform/database/prisma.service.js";

/**
 * **Le catalogue des suites e2e**, semé dans les tables que la boutique lit
 * désormais.
 *
 * Depuis la bascule (Cat C5b), l'autorité de prix du checkout est
 * `catalog_items`, plus la table en dur. Sans ce semis, toute suite qui commande
 * ou qui ouvre l'écran de tarification travaillerait sur un catalogue **vide** —
 * et passerait au vert en ne mesurant rien.
 *
 * Il reprend `CATALOG_SEED` **volontairement** : les suites existantes nomment
 * ses SKU et ses prix, et changer les deux en même temps aurait mélangé « la
 * bascule casse quelque chose » avec « le test parle d'autre chose ». Le seed
 * cesse d'être une source de production pour devenir ce qu'il aurait toujours
 * dû être : un jeu de données de test.
 *
 * La forme suit le PIM, pas le seed : la déclinaison porte un SKU dérivé
 * (`VIE-001-1`), et c'est son `productSku` (`VIE-001`) que la boutique vend.
 */

/** Le rayon du seed → la famille du PIM. L'inverse de la table de l'adaptateur. */
const PIM_CATEGORY_BY_PREFIX: Readonly<Record<string, { id: string; name: string }>> = {
  VIE: { id: "cat_vien", name: "Viennoiseries" },
  PAI: { id: "cat_pains", name: "Pains" },
  PAT: { id: "cat_patis", name: "Pâtisseries" },
  SAL: { id: "cat_sale", name: "Salé & traiteur" },
  CHO: { id: "cat_choco", name: "Chocolat & confiserie" },
};

/** Alimentaire : le seul taux que le seed connaissait, et sa table de surcharges est vide. */
const FOOD_VAT_RATE = 5.5;

export async function seedE2eCatalog(prisma: PrismaService): Promise<void> {
  const receivedAt = new Date("2026-01-01T00:00:00.000Z");
  const categories = [...new Set(Object.keys(PIM_CATEGORY_BY_PREFIX))];

  await prisma.catalogCategory.createMany({
    data: categories.map((prefix, index) => {
      const category = PIM_CATEGORY_BY_PREFIX[prefix];
      if (category === undefined) {
        throw new Error(`Fixture catalogue : préfixe « ${prefix} » sans famille.`);
      }
      return {
        id: category.id,
        name: category.name,
        slug: category.id.replace("cat_", ""),
        position: index,
        vatRatePercent: FOOD_VAT_RATE,
        receivedAt,
      };
    }),
  });

  await prisma.catalogItem.createMany({
    data: CATALOG_SEED.map((item, index) => {
      const prefix = item.sku.slice(0, 3);
      const category = PIM_CATEGORY_BY_PREFIX[prefix];
      if (category === undefined) {
        throw new Error(`Fixture catalogue : SKU « ${item.sku} » sans famille.`);
      }
      return {
        // Le PIM dérive le SKU de la déclinaison de celui du produit.
        sku: `${item.sku}-1`,
        productId: `prod_${item.sku}`,
        productSku: item.sku,
        name: item.name,
        kind: "simple",
        categoryId: category.id,
        // Le semis se lit en centimes — un prix de catalogue s'écrit comme on
        // le prononce. La colonne, elle, est en millicentimes : la conversion
        // se fait ICI, à l'écriture, par une multiplication exacte.
        priceMillicents: millicentsFromCents(item.unitPriceCents),
        isDefault: true,
        position: index,
        receivedAt,
      };
    }),
  });
}
