import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { Public } from './infra/auth/public.decorator.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Route de vie — ouverte : sert de smoke test sans jeton. */
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Sonde de liveness — publique, sans jeton. Chemin standard des probes
   * d'orchestrateur et du canary de déploiement (Cloudflare Containers). Signale
   * seulement que le process a booté et route ; la disponibilité DB (readiness)
   * est un autre sujet, volontairement non couplé ici.
   */
  @Public()
  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
