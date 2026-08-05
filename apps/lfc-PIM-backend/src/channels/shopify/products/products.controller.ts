import { Body, Controller, Get, Post } from '@nestjs/common';
import { z } from 'zod';

import { Public } from '../../../infra/auth/public.decorator.js';
import { PrismaService } from '../../../infra/database/prisma.service.js';
import { ZodBody } from '../../../shared/http/zod-body.pipe.js';
import { ShopifyInspectionService } from './inspection.service.js';
import { ShopifyPushService } from './push.service.js';

const pushPayload = z.object({
  productIds: z.array(z.string()).optional(),
});

/**
 * Ressource **produits** : l'état de synchro (bindings) et le push (projection →
 * empreinte → binding, simulé tant que le driver est en dry-run). Sous-chemin
 * `products` sous le préfixe module `channels/shopify`.
 *
 * ⚠️ `@Public()` temporaire — même dérogation que le catalogue (Auth0 non câblé).
 */
@Public()
@Controller('products')
export class ShopifyProductsController {
  constructor(
    private readonly pushService: ShopifyPushService,
    private readonly inspection: ShopifyInspectionService,
    private readonly prisma: PrismaService,
  ) {}

  /** L'état actuel du catalogue de la boutique — lecture seule (miroir distant). */
  @Get('inspection')
  inspect() {
    return this.inspection.inspect();
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
