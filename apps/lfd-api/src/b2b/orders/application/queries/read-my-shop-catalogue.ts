import type { ShopCatalogueView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ShopCataloguePricing } from "../../../catalog/application/shop-catalogue-pricing.service.js";

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
 * Ce qui est vendable, son rangement ET son prix viennent désormais de
 * `ShopCataloguePricing`, que la route publique appelle à l'identique — seul le
 * `companyId` diffère. Deux implémentations avaient divergé, et c'est ainsi que
 * la promotion publique s'est retrouvée invisible au rayon (R22, 2026-09-09).
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
 * Une résolution pour tout le catalogue, à la quantité **1**, et les matériaux
 * chargés **en un lot** : le coût ne suit pas le nombre d'articles. C'est ce qui
 * rend la route tenable sur une vitrine de quatre-vingt-douze pièces.
 *
 * ⚠️ Elle passait par `OrderLinePricing` jusqu'au 2026-09-09 — c'est-à-dire
 * qu'elle composait un **panier** (acheminement, TVA, totaux) pour n'en garder
 * que des prix unitaires. Un catalogue n'est pas un panier.
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
  constructor(private readonly pricing: ShopCataloguePricing) {}

  async execute(query: ReadMyShopCatalogueQuery): Promise<ShopCatalogueView> {
    return this.pricing.priced(query.companyId);
  }
}
