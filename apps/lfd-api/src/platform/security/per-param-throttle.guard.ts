import { createHash } from "node:crypto";

import {
  Inject,
  Injectable,
  mixin,
  type CanActivate,
  type ExecutionContext,
  type Type,
} from "@nestjs/common";
import { ThrottlerException, ThrottlerStorage } from "@nestjs/throttler";

/**
 * **Un débit par VALEUR d'un paramètre de route**, là où le limiteur global
 * clé sur l'IP — la figure de `perAccountThrottleGuard`, pour une route
 * publique sans compte.
 *
 * Écrit pour le POST de désinscription (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, contradiction
 * B1) : les POST « One-Click » de Gmail et Yahoo viennent de quelques
 * serveurs, et tomberaient en 429 sous le seau par IP après un envoi en
 * nombre. La route saute donc ce seau (`@SkipThrottle()`) et se borne par
 * jeton. La clé du compteur est l'EMPREINTE SHA-256 de la valeur : un jeton
 * ne reste pas en clair dans la mémoire du limiteur.
 *
 * ⚠️ Le stockage est celui du processus, comme le limiteur global.
 */
export interface PerParamLimit {
  /** Le nom du compteur, distinct par route. */
  readonly name: string;
  /** Le paramètre de route qui fait la clé. */
  readonly param: string;
  /** Appels admis par fenêtre, pour UNE valeur. */
  readonly limit: number;
  /** La fenêtre, en millisecondes — c'est aussi la durée du blocage. */
  readonly windowMs: number;
}

interface RequestWithParams {
  readonly params?: Readonly<Record<string, string | undefined>>;
}

/** Fabrique le garde d'une politique de débit par valeur de paramètre. */
export function perParamThrottleGuard(policy: PerParamLimit): Type<CanActivate> {
  @Injectable()
  class PerParamThrottleGuard implements CanActivate {
    constructor(@Inject(ThrottlerStorage) private readonly storage: ThrottlerStorage) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const value = context.switchToHttp().getRequest<RequestWithParams>().params?.[policy.param];
      if (value === undefined) {
        return true;
      }
      const key = createHash("sha256").update(value, "utf8").digest("hex");
      const record = await this.storage.increment(
        `${policy.name}:${key}`,
        policy.windowMs,
        policy.limit,
        policy.windowMs,
        policy.name,
      );
      if (record.isBlocked) {
        throw new ThrottlerException();
      }
      return true;
    }
  }

  return mixin(PerParamThrottleGuard);
}
