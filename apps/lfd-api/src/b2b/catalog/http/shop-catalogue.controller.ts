import type { ShopCatalogueView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ReadShopCatalogueQuery } from "../application/queries/read-shop-catalogue.js";

/**
 * **Le catalogue de la boutique**, en un appel et sans jeton.
 *
 * Publique parce que la boutique l'est : la branche cliente se rend sans
 * attendre Auth0, et aucune de ses routes ne porte de garde. On visite d'abord,
 * on s'identifie pour régler. Une route murée aurait rendu la vitrine
 * inaccessible à qui n'a pas encore de compte — c'est-à-dire à tout prospect.
 *
 * Ce qu'elle sert est donc le prix CANONIQUE, qui pour un visiteur EST le prix.
 * Un client sous mercuriale paiera moins, et cette route ne peut pas le savoir :
 * elle n'a pas de client. Le jour où la boutique s'authentifie, elle devra
 * servir SON prix, et ce sera un second chemin — pas une modification de
 * celui-ci.
 *
 * Surface anonyme ⇒ throttle resserré (60/min/IP) sous le défaut global, comme
 * `pickup-addresses` : c'est la partie la plus exposée de l'API, aucune auth ne
 * la précède.
 *
 * 🔴 **Un seul appel, et c'est le sujet du chantier.** Rayons et articles
 * voyagent ensemble : deux routes rendraient possible un état où la vitrine
 * connaît des articles dont elle ignore le rayon, et doubleraient le coût d'une
 * ouverture de boutique.
 */
@Controller("shop/catalogue")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class ShopCatalogueController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  read(): Promise<ShopCatalogueView> {
    return this.queries.execute<ReadShopCatalogueQuery, ShopCatalogueView>(
      new ReadShopCatalogueQuery(),
    );
  }
}
