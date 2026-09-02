import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { B2bProductDeliveryView } from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { GetB2bProductDeliveryQuery } from "./product-delivery.js";

/**
 * Ressource **frise de livraison** d'une fiche : où elle en est sur la
 * plateforme B2B.
 *
 * Une route séparée du détail produit, et pas un champ de plus : elle interroge
 * l'AUTRE contexte à travers un port, donc elle a son propre coût et son propre
 * mode de défaillance. La greffer sur la fiche ferait tomber l'édition d'un
 * produit le jour où la plateforme répond mal.
 *
 * Elle ne porte **pas** `@PublicationGesture()` : c'est une lecture. Le
 * commutateur ferme ce qui SORT du référentiel, pas ce qui s'y consulte.
 *
 * Surface staff murée par `@AdminSurface("pim_channels")` — le même périmètre
 * que le reste du canal.
 */
@AdminSurface("pim_channels")
@Controller("products")
export class B2bProductDeliveryController {
  constructor(private readonly queries: QueryBus) {}

  @Get(":productId/delivery")
  delivery(@Param("productId") productId: string): Promise<B2bProductDeliveryView> {
    return this.queries.execute<GetB2bProductDeliveryQuery, B2bProductDeliveryView>(
      new GetB2bProductDeliveryQuery(productId),
    );
  }
}
