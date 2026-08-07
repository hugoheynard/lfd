import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { AppService } from "./app.service.js";
import { Public } from "./infra/auth/public.decorator.js";

// Sondes de vie/liveness : frappées en boucle par les probes et le canary de
// déploiement. On les sort du throttler (sinon un déploiement bruyant se
// rate-limiterait lui-même) ; l'abus reste borné par le rate-limit edge du Worker.
@SkipThrottle()
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
  @Get("health")
  health(): { status: "ok" } {
    return { status: "ok" };
  }
}
