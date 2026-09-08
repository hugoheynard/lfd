import type { ShopCatalogueView, ShopItemView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CatalogReader } from "../../../catalog/domain/ports/catalog.reader.js";
import { shopCatalogueOf } from "../../../catalog/application/queries/read-shop-catalogue.js";
import { OrderLinePricing } from "../services/order-line-pricing.service.js";

/**
 * **La vitrine au prix du client** — le second chemin annoncé par
 * `shop-catalogue.controller.ts`.
 *
 * ## Ce qu'elle répare
 *
 * La boutique est publique par décision : on visite d'abord, on s'identifie pour
 * régler. Sa vitrine et son devis servaient donc le prix CANONIQUE, même à un
 * client reconnu — pendant que la commande, elle, était établie avec son
 * `companyId` et donc à sa mercuriale. Un compte négocié naviguait à 2,13 €,
 * voyait son panier totalisé à 2,13 €, et était débité à 1,60 €. L'écart était
 * en sa faveur, donc personne ne réclamait : rien de ce qu'on lui avait négocié
 * ne lui était montré avant la confirmation.
 *
 * ## Pourquoi ici, dans `orders/`, et pas dans `catalog/`
 *
 * Parce que la question n'est pas « qu'est-ce qui est en vente » mais « qu'est-ce
 * que CE client paierait » — celle à laquelle `quote-order` répond déjà pour un
 * panier. Et parce que le graphe l'impose : `OrdersModule` importe
 * `CatalogModule`, l'inverse serait un cycle.
 *
 * Ce qui est vendable et son rangement viennent de `shopCatalogueOf`, la
 * fonction que sert la route publique. Deux définitions de « ce que la vitrine
 * montre » auraient divergé au premier article retiré.
 *
 * ## Le mur, et pourquoi il n'y en a pas besoin ici
 *
 * La société n'est **pas un paramètre** : elle vient du contexte de la requête,
 * résolu par le guard depuis les rattachements du demandeur. Il n'y a donc rien
 * à vérifier — et surtout rien à deviner. Sonder la mercuriale d'un concurrent
 * demanderait un identifiant à passer, et il n'y en a pas.
 *
 * C'est la hiérarchie du dépôt appliquée : inexprimable avant refusé. La
 * première version de cette route prenait la société dans l'URL et la
 * confrontait aux rattachements ; ça marchait, et ça laissait exister la
 * question.
 *
 * ## Le coût
 *
 * Une résolution pour tout le catalogue, à la quantité **1**. `OrderLinePricing`
 * charge ses matériaux **en un lot** — une lecture du catalogue, puis quatre en
 * parallèle —, donc le coût ne suit pas le nombre d'articles. C'est ce qui rend
 * la route tenable sur une vitrine de quatre-vingt-douze pièces.
 *
 * ⚠️ **La quantité 1, et c'est une limite assumée.** `minQuantity` existe à tous
 * les étages : un palier « à partir de 50 » ne se voit donc pas en vitrine. Le
 * panier, lui, résout à la quantité réelle. C'est la même règle que la route
 * publique, et la raison est écrite au §3 de
 * [`documentation/pricing/architecture-prix-boutique.md`](../../../../../../documentation/pricing/architecture-prix-boutique.md).
 */
export class ReadMyShopCatalogueQuery {
  /** `null` = aucune société résolue : la lecture rend alors le tarif catalogue. */
  constructor(readonly companyId: string | null) {}
}

@QueryHandler(ReadMyShopCatalogueQuery)
export class ReadMyShopCatalogueHandler implements IQueryHandler<
  ReadMyShopCatalogueQuery,
  ShopCatalogueView
> {
  constructor(
    private readonly catalog: CatalogReader,
    private readonly pricing: OrderLinePricing,
  ) {}

  async execute(query: ReadMyShopCatalogueQuery): Promise<ShopCatalogueView> {
    const catalogue = shopCatalogueOf(await this.catalog.listSellable());
    // Sans société résolue, il n'y a rien à négocier : c'est le tarif catalogue,
    // le même que la vitrine publique. Résoudre à `companyId: null` rendrait la
    // même chose en payant quatre requêtes pour rien.
    if (query.companyId === null || catalogue.items.length === 0) {
      return catalogue;
    }

    const resolved = await this.pricing.resolve(
      catalogue.items.map((item) => ({ sku: item.sku, quantity: 1 })),
      { companyId: query.companyId },
    );
    // `line.line` porte la ligne résolue : son `unitPriceMillicents` est le prix
    // que la caisse appliquerait à ce client, plancher compris.
    const prices = new Map(
      resolved.map((resolvedLine) => [
        resolvedLine.line.sku,
        resolvedLine.line.unitPriceMillicents,
      ]),
    );

    return { ...catalogue, items: catalogue.items.map((item) => priced(item, prices)) };
  }
}

/**
 * L'article au prix du client, et le tarif à barrer s'il y a un écart.
 *
 * Un SKU absent de la résolution garde son prix canonique : ce n'est pas censé
 * arriver — les deux listes viennent de la même lecture — et retomber sur le
 * tarif est le seul repli qui ne mente pas. Un prix à zéro, lui, ferait croire
 * à un article offert.
 */
function priced(item: ShopItemView, prices: ReadonlyMap<string, number>): ShopItemView {
  const resolved = prices.get(item.sku);
  if (resolved === undefined || resolved === item.unitPriceMillicents) {
    return item;
  }
  return {
    ...item,
    unitPriceMillicents: resolved,
    // Barré seulement quand il y a un écart. Égal, on ne barre pas : une rature
    // sur deux prix identiques ferait chercher une remise qui n'existe pas.
    catalogPriceMillicents: item.unitPriceMillicents,
  };
}
