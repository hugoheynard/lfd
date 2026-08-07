import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";

import { AppConfig } from "../config/app-config.js";
import { attachActor } from "../context/request-context.store.js";

/** En-tête où le Cron Trigger dépose le jeton interne. */
const RECOMPUTE_HEADER = "x-lfc-recompute-token";

/** Requête réduite à ce que le guard lit (les en-têtes). */
interface RecomputeRequest {
  readonly headers: Record<string, string | string[] | undefined>;
}

/**
 * Guard de `POST /admin/recompute` : porte **machine-à-machine**, distincte de la
 * porte staff. Le container dort (`sleepAfter`) → aucun scheduler in-process fiable ;
 * c'est un **Cloudflare Cron Trigger** qui réveille le container et présente un
 * **jeton interne partagé** (`x-lfc-recompute-token`). L'acteur posé est `system`
 * (le journal attribuera un éventuel `reco.shown`/recompute au bon sujet).
 *
 * Deux chemins, comme les autres gardes :
 * - **bypass de DÉVELOPPEMENT** (`adminDevBypass`, fail-closed en prod) : on saute
 *   la vérification — pour déclencher le recompute en local sans jeton.
 * - **prod** : compare l'en-tête au `RECOMPUTE_TOKEN`. Jeton non configuré ⇒
 *   **refus** (fail-closed : jamais d'endpoint batch grand ouvert).
 */
@Injectable()
export class RecomputeGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.adminDevBypass()) {
      attachActor({ type: "system", id: "recompute-dev" });
      return true;
    }

    const request = context.switchToHttp().getRequest<RecomputeRequest>();
    const expected = this.config.recomputeToken();
    const provided = headerValue(request.headers[RECOMPUTE_HEADER]);
    if (expected === null || provided !== expected) {
      throw new UnauthorizedException("Jeton de recompute invalide ou manquant.");
    }

    attachActor({ type: "system", id: "recompute-cron" });
    return true;
  }
}

/** Normalise un en-tête (une valeur ou une liste) en chaîne, ou `undefined`. */
function headerValue(raw: string | string[] | undefined): string | undefined {
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return raw;
}
