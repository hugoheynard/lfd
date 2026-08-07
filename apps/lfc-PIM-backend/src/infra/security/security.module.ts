import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { resolveClientIp } from './client-ip.js';

/**
 * Rate limiting **applicatif** (2e ligne, après le rate-limit edge du Worker).
 *
 * Un seul bucket global `default` (300 req/min par IP) ; les routes sensibles le
 * resserrent via `@Throttle(...)`, les sondes le sautent via `@SkipThrottle()`.
 * Le `ThrottlerGuard` est branché en `APP_GUARD` — importé **avant** `AuthModule`
 * dans `AppModule` pour s'exécuter en premier (le flood est rejeté en 429 avant
 * l'authentification). `getTracker` clé sur l'IP réelle (`x-lfc-client-ip` /
 * `cf-connecting-ip`), pas sur `req.ip` partagé — cf. `client-ip.ts`.
 */
@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      getTracker: (req) => resolveClientIp(req),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class SecurityModule {}
