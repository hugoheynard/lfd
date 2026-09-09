import type { CatalogCategory, ShopCatalogueView, ShopItemView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Pricer } from "../../pricing/application/pricer.js";
import { CatalogReader } from "../domain/ports/catalog.reader.js";
import { catalogueArticle } from "../domain/catalogue-article.js";
import { UnknownCatalogShelfError } from "../domain/errors/unknown-catalog-shelf.error.js";
import { shelfOfCategory } from "../domain/shelf-of-category.js";
import { shopCatalogueOf } from "./shop-catalogue-view.js";

/**
 * **La vitrine à son prix — la même logique pour le visiteur et pour le client.**
 *
 * ## Ce qu'elle répare
 *
 * La vitrine servait le prix **canonique** du miroir, jamais résolu. Une
 * promotion publique — `audience: all`, « −10 % sur les viennoiseries » — était
 * donc **invisible au rayon** et n'apparaissait qu'au panier, où le devis la
 * résout. Le client voyait 2,00 €, payait 1,80 €, et l'écart était dans le bon
 * sens : personne ne réclamait. Mais **une promotion qu'on ne voit pas ne fait
 * pas vendre** — c'est un trou commercial, pas une divergence d'écran.
 *
 * ## Ce qui l'avait caché
 *
 * Une justification fausse, écrite dans le contrat : « elle est publique, donc
 * sans client ». Elle confond deux choses. Un prix **négocié** exige un client,
 * et la route publique ne peut effectivement pas le servir. Une **promotion
 * publique** n'en exige aucun : `matchesAudience` rend `true` pour
 * `audience: all` sans rien regarder.
 *
 * Le même raisonnement avait contaminé la route reconnue, qui court-circuitait
 * sur `companyId === null` en affirmant que « résoudre rendrait la même chose en
 * payant quatre requêtes pour rien ». Non : ça rendait la promotion.
 *
 * ## Pourquoi UN service et non deux chemins
 *
 * Les deux routes posent la même question et ne diffèrent que par un
 * `companyId`. Tant qu'elles avaient deux implémentations, l'une a oublié ce que
 * l'autre faisait — c'est l'histoire de tout ce contexte. Ici la seule variable
 * est l'argument.
 *
 * ## Pourquoi la porte, et plus le chargeur
 *
 * ⚠️ Ce paragraphe expliquait le contraire jusqu'au 2026-09-09 : la vitrine
 * **contournait** la façade, parce que celle-ci relisait le catalogue
 * (`resolveMany`) qu'on avait déjà en main — une lecture de plus sur la seule
 * route anonyme du dépôt. Le JSDoc de `Pricer` l'y autorisait explicitement.
 *
 * La façade ne relit plus rien : elle prend des **articles**. Le motif du
 * contournement a disparu, l'autorisation aussi, et `lint:price-door` interdit
 * désormais d'atteindre le chargeur depuis ici.
 *
 * ## Le coût, compté plutôt qu'estimé
 *
 * **Pas « quatre lectures ».** À `companyId: null`, deux des cinq lecteurs
 * répondent **sans requête** — un visiteur n'a ni engagement
 * (`PrismaVolumeCommitmentReader.liveFor`) ni mercuriale
 * (`PrismaCompanyMercurialeReader.liveFor`). Les trois autres passent par
 * `PricingMaterialsCache`, qui porte déjà son invalidation et son estampille :
 * une rafale de visiteurs ne coûte donc qu'une lecture d'estampille.
 *
 * Ce qui n'est **pas** caché, et c'est le vrai coût à surveiller : si un
 * plancher visant ces articles porte une porte de volume
 * (`dynamic.unlock.minVolumeRatioBp`), le chargeur ajoute **deux agrégats
 * d'historique** par appel. Aucun plancher public n'en porte aujourd'hui ; le
 * jour où l'un en portera, la vitrine anonyme paiera deux lectures non cachées
 * par requête, et c'est le moment où un cache de réponse se posera (vérifié le
 * 2026-09-09).
 *
 * Aucun cache de réponse n'est posé ici : celui des matériaux suffit tant que la
 * porte de volume reste absente, et un cache de plus amènerait une seconde
 * invalidation à tenir d'accord avec la première.
 */
@Injectable()
export class ShopCataloguePricing {
  constructor(
    private readonly catalog: CatalogReader,
    private readonly pricer: Pricer,
  ) {}

  /**
   * Ce qui est en vente, **au prix qui sera facturé**.
   *
   * @param companyId `null` = un visiteur. Le tarif public, promotions
   * comprises, et aucune mercuriale lue — il n'y a rien à négocier sans client.
   *
   * **Ne lève pas** sur une famille sans rayon : l'article sort à son tarif, non
   * tarifé. Cf. {@link shelfFor} — une vitrine anonyme ne tombe pas en entier
   * pour un article.
   */
  async priced(companyId: string | null): Promise<ShopCatalogueView> {
    const sellable = await this.catalog.listSellable();
    const catalogue = shopCatalogueOf(sellable);
    if (catalogue.items.length === 0) {
      return catalogue;
    }

    // 🔴 Le rayon, pas la famille du PIM. `ShopItemView.shelfId` porte
    // `cat_vien` ; le tarificateur attend `viennoiserie`. Construire l'article à
    // tarifer depuis la VUE ferait rater toutes les règles de portée famille,
    // sans que rien ne rougisse.
    const byProductSku = new Map(sellable.map((item) => [item.productSku, item]));
    const articles = catalogue.items.flatMap((item) => {
      const source = byProductSku.get(item.sku);
      const shelf = source === undefined ? null : shelfFor(source.sku, source.categoryId);
      return shelf === null
        ? []
        : [
            {
              // La frappe : la vitrine vient de LIRE le catalogue, elle est donc
              // en droit de sceller ce qu'elle a lu.
              article: catalogueArticle({
                sku: item.sku,
                name: item.name,
                category: shelf,
                unitPriceMillicents: item.unitPriceMillicents,
              }),
              // 🔴 **Quantité 1, et c'est une limite assumée.** `minQuantity`
              // existe à tous les étages : un palier « à partir de 50 » ne se
              // voit pas au rayon. Le panier, lui, résout à la quantité réelle.
              quantity: 1,
            },
          ];
    });

    if (articles.length === 0) {
      // Rien à tarifer : la vitrine sort au tarif, c'est-à-dire exactement ce
      // qu'elle servait avant R22. Un rayon vide serait pire qu'un rayon au
      // canonique.
      return catalogue;
    }

    // 🔴 La porte prend l'instant elle-même, une fois pour tout le lot : deux
    // articles résolus à quelques millisecondes d'écart pourraient sinon tomber
    // de part et d'autre du basculement d'une promotion.
    const lot = await this.pricer.load({ articles, companyId });
    const lines = articles.map(({ article, quantity }) => ({ sku: article.sku, quantity }));
    const prices = new Map(lot.all(lines).map((priced) => [priced.sku, priced.finalMillicents]));
    return { ...catalogue, items: catalogue.items.map((item) => struck(item, prices)) };
  }
}

/**
 * L'article à son prix, et le tarif à **barrer** quand le prix servi est plus bas.
 *
 * Rien de barré à prix égal : une rature sur deux prix identiques ferait
 * chercher une remise qui n'existe pas. Le champ reste donc **absent du fil**
 * dans le cas ordinaire, ce qui garde la surface publique étroite.
 *
 * Un SKU absent de la résolution garde son prix canonique : ce n'est pas censé
 * arriver — les deux listes viennent de la même lecture — et retomber sur le
 * tarif est le seul repli qui ne mente pas. Un prix à zéro, lui, ferait croire à
 * un article offert.
 */
function struck(item: ShopItemView, prices: ReadonlyMap<string, number>): ShopItemView {
  const resolved = prices.get(item.sku);
  if (resolved === undefined) {
    return item;
  }
  // 🔴 **Barré seulement si le prix servi est plus BAS**, jamais « s'ils
  // diffèrent ». Un prix résolu peut monter au-dessus du tarif — une altération
  // `increase`, une règle `replace` posée plus haut, ou un plancher qui relève
  // (`resolve-price.ts:121`). Sur « ils diffèrent », la vitrine aurait alors
  // barré le prix le plus BAS et présenté une référence mensongère sur une page
  // publique. Le prix servi reste celui qui sera facturé, dans les deux sens ;
  // c'est la rature qui exige une baisse (2026-09-09).
  if (resolved >= item.unitPriceMillicents) {
    return resolved === item.unitPriceMillicents
      ? item
      : { ...item, unitPriceMillicents: resolved };
  }
  return {
    ...item,
    unitPriceMillicents: resolved,
    catalogPriceMillicents: item.unitPriceMillicents,
  };
}

/**
 * Le rayon d'un article, ou `null` s'il n'en a pas — **et la vitrine continue**.
 *
 * `shelfOfCategory` refuse une famille inconnue, et c'est la bonne réponse au
 * checkout : mieux vaut ne pas vendre que facturer au hasard. Sur la vitrine
 * **anonyme**, la même réponse ferait tomber la page entière en 500 pour tous
 * les visiteurs, à cause d'un seul article d'une famille que le PIM vient
 * d'inventer.
 *
 * L'article sort donc **à son tarif**, non tarifé — exactement ce que cette
 * route servait avant R22. Ce n'est pas un prix inventé : c'est le canonique,
 * et la famille inconnue reste refusée là où elle compte, au moment de
 * commander.
 */
function shelfFor(sku: string, categoryId: string): CatalogCategory | null {
  try {
    return shelfOfCategory(sku, categoryId);
  } catch (error) {
    if (error instanceof UnknownCatalogShelfError) {
      return null;
    }
    throw error;
  }
}
