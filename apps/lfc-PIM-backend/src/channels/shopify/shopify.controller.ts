import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { z } from 'zod';

import { Public } from '../../infra/auth/public.decorator.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { ZodBody } from '../../shared/http/zod-body.pipe.js';
import { ShopifyCollectionsService } from './shopify-collections.service.js';
import { ShopifyConnectionService } from './shopify-connection.service.js';
import { ShopifyPushService } from './shopify-push.service.js';
import { ShopifySettingsService } from './shopify-settings.service.js';

const settingsPayload = z.object({
  shopDomain: z.string(),
  apiVersion: z.string().min(1),
  isEnabled: z.boolean(),
});

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

/** ⚠️ `@Public()` temporaire — même dérogation que le catalogue (Auth0 non configuré). */
@Public()
@Controller('channels/shopify')
export class ShopifyController {
  constructor(
    private readonly settings: ShopifySettingsService,
    private readonly connection: ShopifyConnectionService,
    private readonly collections: ShopifyCollectionsService,
    private readonly pushService: ShopifyPushService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('settings')
  readSettings() {
    return this.settings.read();
  }

  @Put('settings')
  saveSettings(
    @Body(new ZodBody(settingsPayload)) body: z.infer<typeof settingsPayload>,
  ) {
    return this.settings.save(body);
  }

  /** Test de connexion — bouton « Vérifier » de l'écran d'intégration. */
  @Post('settings/verify')
  verify() {
    return this.connection.verify();
  }

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
