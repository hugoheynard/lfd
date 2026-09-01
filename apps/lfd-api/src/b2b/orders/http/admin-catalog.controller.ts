import { type CatalogItemView, type CustomerSkuStat } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ListCatalogQuery } from "../application/queries/list-catalog.query.js";
import { ListCustomerSkusQuery } from "../application/queries/list-customer-skus.query.js";

/**
 * Le **catalogue vu du back-office** — ce qu'il faut pour composer une commande
 * au nom d'un client.
 *
 * Deux lectures, et la seconde est la vraie raison de cet écran : devant 92
 * produits, le commercial n'a pas besoin d'un catalogue, il a besoin des trente
 * lignes que ce client-là reprend chaque semaine.
 *
 * Ressource `orders` et non un `catalog` de plus : ce n'est pas la gestion du
 * catalogue (elle vit au PIM), c'est de quoi saisir une commande. Nommer une
 * ressource par l'écran qui la lit plutôt que par ce qu'elle autorise finit par
 * multiplier les droits sans multiplier les décisions.
 */
@Controller("admin/catalog")
@AdminSurface("b2b_orders")
export class AdminCatalogController {
  constructor(private readonly queries: QueryBus) {}

  /** Le catalogue entier, rangé par rayon — celui-là même qui fixe les prix. */
  @Get()
  async list(): Promise<readonly CatalogItemView[]> {
    return this.queries.execute<ListCatalogQuery, readonly CatalogItemView[]>(
      new ListCatalogQuery(),
    );
  }

  /**
   * Ce que **cette société** a déjà commandé, les plus repris en tête. Une
   * société inconnue rend une liste vide, comme une société sans commande : le
   * back-office a déjà de quoi savoir qu'elle existe, et distinguer ici les deux
   * cas n'apprendrait rien à l'écran.
   */
  @Get("companies/:companyId")
  async forCompany(@Param("companyId") companyId: string): Promise<readonly CustomerSkuStat[]> {
    return this.queries.execute<ListCustomerSkusQuery, readonly CustomerSkuStat[]>(
      new ListCustomerSkusQuery(companyId),
    );
  }
}
