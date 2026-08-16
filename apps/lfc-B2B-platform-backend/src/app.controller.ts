import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { AppService } from "./app.service.js";
import { Public } from "./infra/auth/public.decorator.js";
import { AppConfig } from "./infra/config/app-config.js";

// Sondes de vie/liveness : frappées en boucle par les probes et le canary de
// déploiement. On les sort du throttler (sinon un déploiement bruyant se
// rate-limiterait lui-même) ; l'abus reste borné par le rate-limit edge du Worker.
@SkipThrottle()
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly config: AppConfig,
  ) {}

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
   *
   * **Elle dit QUELLE révision répond**, et c'est ce qui la rend utile au
   * déploiement. Un `{ status: "ok" }` nu est vrai de l'ANCIENNE image comme de
   * la nouvelle : attendre un 200 après un déploiement ne prouverait donc rien.
   * Constaté le 2026-08-16 — l'ancienne instance répondait parfaitement, sur une
   * route qu'elle ne connaissait pas encore. Avec la révision, un déploiement
   * attend une condition VRAIE (« l'image que je viens de pousser répond »)
   * plutôt qu'une durée devinée.
   *
   * Elle répond au passage à la question qu'on se pose à 7 h du matin quand
   * quelque chose cloche : qu'est-ce qui tourne, là, maintenant ?
   */
  @Public()
  @Get("health")
  health(): { status: "ok"; revision: string } {
    return { status: "ok", revision: this.config.revision() };
  }
}
