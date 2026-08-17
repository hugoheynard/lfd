import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';

import { Public } from '../../../infra/auth/public.decorator.js';
import { ZodBody } from '../../../shared/http/zod-body.pipe.js';
import { B2bCatalogPushService, type B2bPushSummary } from './push.service.js';

const pushPayload = z.object({
  /**
   * Simuler plutôt qu'envoyer. Par **défaut vrai** : un bouton qui pousse le
   * catalogue vendu ne doit pas partir sur un appel mal formé. L'envoi réel se
   * demande explicitement.
   */
  dryRun: z.boolean().default(true),
});

/**
 * Ressource **push** du canal B2B. Sous-chemin `push` sous le préfixe module
 * `channels/b2b`.
 *
 * ⚠️ `@Public()` temporaire — même dérogation que le catalogue (Auth0 non câblé).
 */
@Public()
@Controller('push')
export class B2bPushController {
  constructor(private readonly pushService: B2bCatalogPushService) {}

  @Post()
  push(
    @Body(new ZodBody(pushPayload)) body: z.infer<typeof pushPayload>,
  ): Promise<B2bPushSummary> {
    return this.pushService.push(body.dryRun);
  }
}
