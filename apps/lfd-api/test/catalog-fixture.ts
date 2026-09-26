import { millicentsFromCents } from "@lfd/money";
import { htMillicentsOf } from "@lfd/pim-contracts";
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

/**
 * **Les familles du semis**, telles que le référentiel les livrerait : un id
 * opaque, un nom, un slug, une position.
 *
 * Aucune table de rayons ne les connaît depuis le 2026-09-26 (plan des
 * familles en données) : une portée « famille » vise leur `id`. Les suites qui
 * posent une décision de famille le lisent ici plutôt que de le recopier.
 *
 * Les slugs sont ceux de la production (plan §3) : c'est par eux que la
 * migration `les_familles_se_lisent_en_donnees` retrouve une famille à partir
 * d'un ancien code de rayon, et sa suite les rejoue sur ce semis.
 */
export const E2E_FAMILIES = {
  VIE: { id: "fam-vien", name: "Viennoiseries", slug: "viennoiseries" },
  PAI: { id: "fam-pains", name: "Pains", slug: "pains" },
  PAT: { id: "fam-patis", name: "Pâtisseries", slug: "patisseries" },
  SAL: { id: "fam-sale", name: "Salé & traiteur", slug: "sale-traiteur" },
  CHO: { id: "fam-choco", name: "Chocolat & confiserie", slug: "chocolat-confiserie" },
} as const;

/** Le préfixe d'un SKU du semis → sa famille. */
const PIM_CATEGORY_BY_PREFIX: Readonly<
  Record<string, { readonly id: string; readonly name: string; readonly slug: string }>
> = E2E_FAMILIES;

/**
 * Alimentaire : le seul taux que le seed connaissait, et sa table de surcharges
 * est vide.
 *
 * 🔴 **Il est posé sur la FAMILLE et sur chaque ARTICLE**, et il ne l'était que
 * sur la famille jusqu'au 2026-09-06. Cette fixture reposait donc sur le repli
 * de `billableRate` — 140 e2e passaient grâce à lui, et aucun n'éprouvait la
 * règle que le schéma affirme : « un article sans taux ne se vend pas ».
 *
 * Un repli porteur dans le harnais est le pire endroit où en trouver un : il
 * rend vertes précisément les suites qui auraient dû le contredire. Le semis
 * fait désormais ce qu'un vrai push fait — le PIM résout le taux par produit
 * (`effectiveVat`) et le pose sur chaque déclinaison.
 */
const FOOD_VAT_RATE = 5.5;

/**
 * **Le contexte de vente que la boutique publique expose** (Hugo, 2026-09-21,
 * D7 : « à emporter pour le moment »).
 *
 * C'est une VALEUR de donnée, pas un nom de code : elle est ici en clair parce
 * que le semis joue un push du référentiel, et qu'un push écrit la clé telle que
 * le lecteur la cherchera.
 */
const PUBLIC_CONTEXT_KEY = "takeaway";

/**
 * **L'étiquette publique vaut 125 % du prix pro TTC**, et ce n'est pas un
 * chiffre décoratif.
 *
 * 🔴 **Le semis doit poser DEUX prix distincts, sinon il ne prouve plus rien.**
 * Une fixture où le public et le pro coïncident passe au vert que le lecteur
 * serve l'un ou l'autre : elle rendrait muettes exactement les suites qui
 * doivent tenir la distinction. C'est le même piège que le repli de
 * `billableRate` documenté ci-dessus — un harnais complaisant.
 *
 * Le rapport est l'INVERSE de celui de la projection : le pro paie 80 % de
 * l'étiquette, donc l'étiquette vaut 1 / 0,8 du prix pro. La fixture raconte
 * ainsi la vraie chaîne — l'étiquette est l'ancre, le prix pro en dérive —
 * plutôt qu'un écart inventé.
 *
 * ⚠️ Elle **n'appelle pas** `proPriceOf` pour autant : le semis part du prix pro
 * (que 140 suites nomment) et remonte, là où la production part de l'étiquette
 * et descend. Remonter une projection arrondie ne rend pas la valeur de départ,
 * et prétendre le contraire ferait dépendre les tests d'un aller-retour qui
 * n'existe nulle part.
 */
const PUBLIC_LABEL_RATIO = 1.25;

/** L'étiquette TTC que le référentiel aurait saisie pour ce prix pro HT. */
function publicLabelCentsOf(proHtCents: number): number {
  return Math.round(proHtCents * (1 + FOOD_VAT_RATE / 100) * PUBLIC_LABEL_RATIO);
}

/**
 * La carte de prix publics telle qu'un push la range — dérivée par la MÊME
 * fonction que la projection (`htMillicentsOf`), pour que la fixture ne puisse
 * pas dériver de ce qu'elle prétend imiter.
 */
function publicByContextOf(
  publicTtcCents: number,
): Record<string, { vatRatePercent: number; htMillicents: number }> {
  const htMillicents = htMillicentsOf(publicTtcCents, FOOD_VAT_RATE);
  if (htMillicents === null) {
    throw new Error(`Fixture catalogue : étiquette « ${publicTtcCents} » sans hors taxe.`);
  }
  return { [PUBLIC_CONTEXT_KEY]: { vatRatePercent: FOOD_VAT_RATE, htMillicents } };
}

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
        slug: category.slug,
        position: index,
        vatRatePercent: FOOD_VAT_RATE,
        receivedAt,
      };
    }),
  });

  /**
   * 🔴 **La trace du tarif se sème AVEC l'article, jamais après.**
   *
   * En production, les deux s'écrivent dans une seule transaction — c'est
   * exactement ce que `PrismaCatalogItemRepository.saveMany` garantit, « le seul
   * point par lequel ils passent ». Une fixture qui pose l'article sans sa trace
   * fabrique donc un état que la production **ne peut pas produire** : un
   * catalogue sans histoire.
   *
   * Ça ne se voyait pas tant que rien ne relisait le passé. Depuis que la porte
   * du prix rescelle les articles au tarif de la date demandée (R17), une
   * relecture datée sur ce catalogue-là ne trouve rien et refuse — ce qui est le
   * bon comportement du code, sur une donnée impossible.
   */
  const canonicalTrace = (sku: string, priceMillicents: number) => ({
    id: `cph_${sku}`,
    sku: `${sku}-1`,
    productSku: sku,
    priceMillicents,
    vatRatePercent: FOOD_VAT_RATE,
    // `pim` : le semis joue un push du référentiel, pas une décision B2B.
    source: "pim",
    // La MÊME date que l'article. Deux instants distincts laisseraient une
    // fenêtre où l'article existe sans prix connu, et un test daté juste dedans
    // échouerait sans que rien ne l'explique.
    recordedAt: receivedAt,
  });

  await prisma.catalogPriceHistory.createMany({
    data: CATALOG_SEED.map((item) =>
      canonicalTrace(item.sku, millicentsFromCents(item.unitPriceCents)),
    ),
  });

  await prisma.catalogItem.createMany({
    data: CATALOG_SEED.map((item, index) => {
      const prefix = item.sku.slice(0, 3);
      const category = PIM_CATEGORY_BY_PREFIX[prefix];
      if (category === undefined) {
        throw new Error(`Fixture catalogue : SKU « ${item.sku} » sans famille.`);
      }
      const publicTtcCents = publicLabelCentsOf(item.unitPriceCents);
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
        // Sur l'ARTICLE, comme un push le fait : c'est lui qu'on facture.
        vatRatePercent: FOOD_VAT_RATE,
        // 🔴 L'étiquette ET sa carte de contextes, dans la même écriture que
        // l'article : un push v9 les pose ensemble, et un article sans prix
        // public est ÉCARTÉ de la boutique publique plutôt que servi au tarif
        // pro. Les semer à part fabriquerait un catalogue à moitié poussé.
        publicTtcCents,
        publicByContext: publicByContextOf(publicTtcCents),
        isDefault: true,
        position: index,
        receivedAt,
      };
    }),
  });
}
