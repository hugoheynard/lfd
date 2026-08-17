import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import {
  setB2bMembershipPayloadSchema,
  type B2bMembershipView,
  type SetB2bMembershipPayload,
} from '@lfd/pim-contracts';

import { Public } from '../../../infra/auth/public.decorator.js';
import { ZodBody } from '../../../shared/http/zod-body.pipe.js';
import { B2bMembershipService } from './membership.service.js';

/**
 * Ressource **appartenance au canal** : qui est vendu aux pros. Sous-chemin
 * `products` sous le préfixe module `channels/b2b`.
 *
 * Une seule route de mutation, en `PUT` avec un booléen, plutôt qu'un couple
 * publier/dépublier : c'est une bascule, et l'écran qui l'actionne ne veut pas
 * savoir dans quel sens il va — il veut poser un état.
 *
 * ⚠️ `@Public()` temporaire — même dérogation que le catalogue (Auth0 non câblé).
 * L'auteur de la publication est donc `null` tant que l'identité staff n'arrive
 * pas jusqu'ici ; la colonne existe pour ne pas avoir à migrer ce jour-là.
 */
@Public()
@Controller('products')
export class B2bMembershipController {
  constructor(private readonly membership: B2bMembershipService) {}

  @Get()
  list(): Promise<B2bMembershipView[]> {
    return this.membership.list();
  }

  @Put(':productId')
  async set(
    @Param('productId') productId: string,
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
