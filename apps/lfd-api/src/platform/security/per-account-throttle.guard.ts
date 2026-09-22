import {
  Inject,
  Injectable,
  mixin,
  type CanActivate,
  type ExecutionContext,
  type Type,
} from "@nestjs/common";
import { ThrottlerException, ThrottlerStorage } from "@nestjs/throttler";

import type { AuthenticatedRequest } from "../auth/principal.js";

/**
 * **Un débit par COMPTE**, là où le limiteur global du dépôt clé sur l'IP.
 *
 * ## Pourquoi un second limiteur, et pas un `@Throttle` de plus
 *
 * `SecurityModule` clé son bucket `default` sur l'IP cliente
 * (`getTracker: resolveClientIp`). C'est la bonne clé pour un flood ; ce n'est
 * pas celle d'un geste qui envoie un **courriel à une personne nommée**. Cent
 * appels depuis cent adresses IP passent le limiteur global sans effort, et
 * noient une boîte : une adresse en rebond dur entre en liste de suppression
 * chez Resend, d'où elle ne sort qu'à la main, et le compte devient injoignable
 * pour **tous** les autres courriels — commande, mandat, accès (CLAUDE.md §0).
 * Le dommage n'est pas la charge serveur, c'est la boîte du client.
 *
 * ## Pourquoi un garde de route, et pas un second throttler global
 *
 * Le `ThrottlerGuard` global est branché **avant** `AuthModule` pour rejeter un
 * flood sans payer l'authentification : quand il s'exécute, `req.principal`
 * n'existe pas encore, donc aucun de ses trackers ne peut connaître le compte.
 * Un garde posé sur la route, lui, passe après les gardes globaux — le principal
 * est là. Il réutilise le **stockage** du throttler, pas son garde : un seul
 * compteur en mémoire, une seule durée de vie, rien à purger en double.
 *
 * ⚠️ **Le stockage est celui du processus.** Avec plusieurs instances, la limite
 * est par instance ; elle borne alors l'emballement, pas l'acharnement. C'est
 * déjà le cas du limiteur global, et c'est une raison de plus de ne jamais s'en
 * remettre à lui seul pour une garantie de sécurité.
 *
 * Étendre se fait par **un garde de plus** (OCP) : `perAccountThrottleGuard`
 * rend une classe par politique, nommée sur son geste.
 */
export interface PerAccountLimit {
  /**
   * Le nom du compteur. Distinct par geste : deux routes qui partageraient le
   * même nom partageraient leur quota, et l'une épuiserait l'autre.
   */
  readonly name: string;
  /** Nombre d'appels admis par fenêtre, pour UN compte. */
  readonly limit: number;
  /** La fenêtre, en millisecondes — c'est aussi la durée du blocage. */
  readonly windowMs: number;
}

/**
 * Fabrique le garde d'une politique de débit par compte.
 *
 * @param policy le compteur, le quota et la fenêtre de CE geste.
 */
export function perAccountThrottleGuard(policy: PerAccountLimit): Type<CanActivate> {
  @Injectable()
  class PerAccountThrottleGuard implements CanActivate {
    constructor(@Inject(ThrottlerStorage) private readonly storage: ThrottlerStorage) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
      const principal = request.principal;
      // Sans principal, il n'y a pas de compte à borner — et il n'y a pas non
      // plus de route : le garde d'authentification a déjà refusé. On laisse
      // passer plutôt que de fabriquer une clé partagée par tous les anonymes,
      // qui bornerait tout le monde ensemble au premier abus.
      if (principal === undefined) {
        return true;
      }
      const record = await this.storage.increment(
        `${policy.name}:${principal.userId}`,
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

  return mixin(PerAccountThrottleGuard);
}
