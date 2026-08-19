import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import {
  setB2bMembershipPayloadSchema,
  setB2bMembershipsPayloadSchema,
  type B2bMembershipView,
  type SetB2bMembershipPayload,
  type SetB2bMembershipsPayload,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../../platform/shared/http/zod-body.pipe.js";
import { B2bMembershipService } from "./membership.service.js";

/**
 * Ressource **appartenance au canal** : qui est vendu aux pros. Sous-chemin
 * `products` sous le préfixe module `channels/b2b`.
 *
 * Une seule route de mutation, en `PUT` avec un booléen, plutôt qu'un couple
 * publier/dépublier : c'est une bascule, et l'écran qui l'actionne ne veut pas
 * savoir dans quel sens il va — il veut poser un état.
 *
 * Surface staff murée par `@AdminSurface("catalog")` : identité vérifiée
 * contre l'annuaire, puis périmètre. Elle a été **ouverte** tant que le
 * référentiel vivait dans son propre processus — un jeton Auth0 valide
 * suffisait, et un révoqué gardait la main sur le catalogue.
 * L'auteur de la publication est donc `null` tant que l'identité staff n'arrive
 * pas jusqu'ici ; la colonne existe pour ne pas avoir à migrer ce jour-là.
 */
@AdminSurface("catalog")
@Controller("products")
export class B2bMembershipController {
  constructor(private readonly membership: B2bMembershipService) {}

  @Get()
  list(): Promise<B2bMembershipView[]> {
    return this.membership.list();
  }

  /**
   * Bascule **en lot**. Déclarée avant la route paramétrée : sans ça, Nest ferait
   * correspondre `PUT /products` à `PUT /products/:productId` avec un id vide.
   */
  @Put()
  async setMany(
    @Body(new ZodBody(setB2bMembershipsPayloadSchema))
    body: SetB2bMembershipsPayload,
  ): Promise<{ affected: number }> {
    const affected = body.published
      ? await this.membership.publishMany(body.productIds, null)
      : await this.membership.unpublishMany(body.productIds);
    return { affected };
  }

  @Put(":productId")
  async set(
    @Param("productId") productId: string,
    @Body(new ZodBody(setB2bMembershipPayloadSchema))
    body: SetB2bMembershipPayload,
  ): Promise<void> {
    if (body.published) {
      await this.membership.publish(productId, null);
      return;
    }
    await this.membership.unpublish(productId);
  }
}
