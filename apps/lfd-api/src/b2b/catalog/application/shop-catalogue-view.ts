import type { ContentLocale, ShopCatalogueView, ShopItemView, ShopShelfView } from "@lfd/contracts";
import { lineTotalCents, pieces, ttcCentsFromHtMillicents, ttcCentsOf } from "@lfd/money";

import { CATALOG_SOURCE_LANGUAGE, inLanguage } from "../domain/catalog-translations.js";
import type { ResolvedCatalogItem, ShopAudience } from "../domain/ports/catalog.reader.js";
import { shopAllergensOf } from "../domain/shop-allergens.js";
import {
  itemOperationOf,
  shopAccessOf,
  shopOperationsOf,
  type ShopSale,
} from "./shop-catalogue-operations.js";

/**
 * **Ce qu'une vitrine montre, et comment ça se range** — sans un seul prix
 * résolu.
 *
 * Ce fichier a été extrait du handler de la route publique le 2026-09-09, et
 * pas par goût du rangement : `ShopCataloguePricing` en a besoin, le handler a
 * besoin du service, et le graphe s'est refermé en cycle —
 * `lint:import-cycles` l'a vu là où `tsc`, les tests et la compilation ne
 * voyaient rien.
 *
 * Le composer ici plutôt que dans un handler dit aussi ce qu'il est : la
 * définition de « ce que la vitrine montre », partagée par les deux routes.
 * Deux définitions auraient divergé au premier article retiré — et une boutique
 * qui montre à un client un article que l'autre ne voit pas est le genre
 * d'écart qu'on ne découvre qu'au téléphone.
 */

/**
 * Les articles vendables et leurs rayons, au **tarif** — le prix vient après.
 *
 * 🔴 **Les opérations datées s'appliquent ICI** (D5 du plan des opérations
 * datées) : un article « vendu seulement pendant une opération » qu'aucune ne
 * montre à cette clientèle n'est ni en rayon, ni en fiche. Le lecteur, lui, le
 * rend toujours — la fiche atelier et la tarification en ont besoin.
 */
export function shopCatalogueOf(
  sellable: readonly ResolvedCatalogItem[],
  sale: ShopSale,
): ShopCatalogueView {
  const shown: ResolvedCatalogItem[] = [];
  const items: ShopItemView[] = [];
  for (const item of sellable) {
    if (!item.isDefault) {
      continue;
    }
    const access = shopAccessOf(item, sale);
    if (access === "absent") {
      continue;
    }
    shown.push(item);
    const operation = itemOperationOf(item, access, sale);
    const shownItem = toItem(item, sale.audience);
    items.push(operation === null ? shownItem : { ...shownItem, operation });
  }
  return {
    shelves: shelvesOf(sellable, items),
    items,
    operations: shopOperationsOf(sale, shown),
  };
}

/**
 * **L'étiquette TTC d'un article**, selon la clientèle (plan
 * `documentation/pricing/plan-centime-particuliers.md`, § 4 et § 8) :
 *
 * - `public` — `ttcCentsFromHtMillicents`, la valeur saisie au référentiel, et
 *   celle que la commande d'un particulier multiplie par la quantité : le
 *   client paie ce qu'il lit ;
 * - `pro` — inchangé : le HT de ligne arrondi d'abord, puis la taxe.
 *
 * L'audience est celle que `ShopCataloguePricing` a déjà déduite de l'espace
 * de travail — jamais redécidée ici.
 */
export function ttcCentsFromHtMillicentsFor(
  unitPriceMillicents: number,
  vatRate: number,
  audience: ShopAudience,
): number {
  return audience === "public"
    ? ttcCentsFromHtMillicents(unitPriceMillicents, vatRate)
    : ttcCentsOf(lineTotalCents(unitPriceMillicents, pieces(1)), vatRate);
}

function toItem(item: ResolvedCatalogItem, audience: ShopAudience): ShopItemView {
  return {
    sku: item.productSku,
    name: item.name,
    note: item.note,
    image: item.image,
    thumbnail: item.thumbnail,
    // Le prix EFFECTIF — celui du B2B s'il a été décidé, celui du référentiel
    // sinon. C'est ce qu'un visiteur paiera, et c'est ce que la caisse
    // appliquera : les deux viennent de la même composition, faite une fois
    // dans le lecteur.
    unitPriceMillicents: item.unitPriceMillicents,
    unitPriceTtcCents: ttcCentsFromHtMillicentsFor(
      item.unitPriceMillicents,
      item.vatRate,
      audience,
    ),
    vatRatePercent: item.vatRate,
    shelfId: item.categoryId,
    isFeatured: item.isFeatured,
    // À qui l'article se vend (Hugo, 2026-10-18, option a) : « aussi pour les
    // professionnels » se lit `both`. La route publique ne rend jamais `pro` —
    // `servedTo` l'a écarté au lecteur.
    audience: item.audience,
    // Absents quand le commerce ne sait pas — jamais « aucun allergène » par
    // défaut, et la clé n'entre pas dans le fil pour rien.
    ...allergensOf(item, CATALOG_SOURCE_LANGUAGE),
  };
}

/** Le bloc d'allergènes d'une carte, dans une langue — ou rien. */
function allergensOf(
  item: ResolvedCatalogItem,
  language: ContentLocale,
): Pick<ShopItemView, "allergens"> {
  const allergens = shopAllergensOf(item.shopAllergens, language);
  return allergens === null ? {} : { allergens };
}

/**
 * **La vitrine dans une langue** — noms, lignes et rayons traduits quand le
 * référentiel les a traduits, en français sinon (lot des langues, 2026-10-18).
 *
 * Appliquée APRÈS la composition et le prix, sur la vue finie : rien de ce
 * qui se range, se vend ou se tarife ne dépend de la langue, et la frappe que
 * la tarification scelle reste celle du français. Les opérations portent déjà
 * leurs trois langues (`ShopOperationText`) et ne sont pas touchées.
 *
 * En français, la vue est rendue telle quelle : c'est la langue de `name` et
 * `note`, et la boutique d'avant ce lot n'en demandait pas d'autre.
 */
export function inShopLanguage(
  view: ShopCatalogueView,
  sellable: readonly ResolvedCatalogItem[],
  language: ContentLocale,
): ShopCatalogueView {
  if (language === CATALOG_SOURCE_LANGUAGE) {
    return view;
  }
  const byProductSku = new Map(
    sellable.filter((item) => item.isDefault).map((item) => [item.productSku, item]),
  );
  const byFamily = new Map(sellable.map((item) => [item.categoryId, item]));
  return {
    ...view,
    items: view.items.map((item) => {
      const source = byProductSku.get(item.sku);
      return source === undefined
        ? item
        : {
            ...item,
            name: inLanguage(item.name, source.translations.name, language),
            note: inLanguage(item.note, source.translations.note, language),
            ...allergensOf(source, language),
          };
    }),
    shelves: view.shelves.map((shelf) => {
      const source = byFamily.get(shelf.id);
      return source === undefined
        ? shelf
        : { ...shelf, name: inLanguage(shelf.name, source.translations.categoryName, language) };
    }),
  };
}

/**
 * Les rayons **réellement peuplés**, dans l'ordre du référentiel.
 *
 * Un rayon vide n'est pas une famille de moins au catalogue : c'est une
 * pastille sur laquelle un client clique pour ne rien voir. La vitrine ne
 * range que ce qu'elle montre.
 *
 * La position vient de la première occurrence : `listSellable` rend déjà les
 * articles dans l'ordre d'affichage, rayon par rayon.
 */
function shelvesOf(
  sellable: readonly ResolvedCatalogItem[],
  shown: readonly ShopItemView[],
): readonly ShopShelfView[] {
  const peopled = new Set(shown.map((item) => item.shelfId));
  const shelves = new Map<string, ShopShelfView>();
  for (const item of sellable) {
    if (!peopled.has(item.categoryId) || shelves.has(item.categoryId)) {
      continue;
    }
    shelves.set(item.categoryId, {
      id: item.categoryId,
      name: item.categoryName,
      position: shelves.size,
    });
  }
  return [...shelves.values()];
}
