import { Body, Controller, Get, Post } from '@nestjs/common';
import { z } from 'zod';

import { Public } from '../../infra/auth/public.decorator.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { ZodBody } from '../../shared/http/zod-body.pipe.js';
import { ShopifyCollectionsService } from './shopify-collections.service.js';
import { ShopifyPushService } from './shopify-push.service.js';

const pushPayload = z.object({
  productIds: z.array(z.string()).optional(),
});

/** Les collections de TVA voulues, telles que le front les connaît (handle + titre). */
const desiredCollectionsPayload = z.object({
  desired: z.array(
    z.object({
      handle: z.string().min(1),
      title: z.string().min(1),
    }),
  ),
});

/**
 * Les **ressources Shopify** : la réconciliation des collections de TVA et le
 * push produit. La connexion au canal (réglages, vérification) vit à côté, dans
 * {@link ChannelController}.
 *
 * Préfixe monté par le module (`channels/shopify`) via `RouterModule` : ce
 * contrôleur ne déclare que ses sous-chemins.
 *
 * ⚠️ `@Public()` temporaire — même dérogation que le catalogue (Auth0 non câblé).
 */
@Public()
@Controller()
export class ShopifyController {
  constructor(
    private readonly collections: ShopifyCollectionsService,
    private readonly pushService: ShopifyPushService,
    private readonly prisma: PrismaService,
  ) {}

  /** Rapproche les collections de TVA voulues et la boutique, sans rien écrire. */
  @Post('collections/tva/inspect')
  inspectCollections(
    @Body(new ZodBody(desiredCollectionsPayload))
    body: z.infer<typeof desiredCollectionsPayload>,
  ) {
    return this.collections.inspect(body.desired);
  }

  /** Crée les collections de TVA manquantes (vides), puis renvoie l'état réconcilié. */
  @Post('collections/tva/push')
  pushCollections(
    @Body(new ZodBody(desiredCollectionsPayload))
    body: z.infer<typeof desiredCollectionsPayload>,
  ) {
    return this.collections.push(body.desired);
  }

  /** État de synchro par produit — alimente la colonne du tableau. */
  @Get('bindings')
  async listBindings() {
    const rows = await this.prisma.shopifyProductBinding.findMany();
    return rows.map((row) => ({
      productId: row.productId,
      syncStatus: row.syncStatus,
      lastPushedAt: row.lastPushedAt?.toISOString() ?? null,
      lastError: row.lastError,
    }));
  }

  @Post('push')
  push(@Body(new ZodBody(pushPayload)) body: z.infer<typeof pushPayload>) {
    return this.pushService.push(body.productIds);
  }
}
