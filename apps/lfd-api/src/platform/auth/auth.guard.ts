import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { attachActor } from "../context/request-context.store.js";
import { AccessTokenVerifier } from "./access-token.verifier.js";
import { PrincipalResolver } from "./principal.resolver.js";
import { DevImpersonation } from "./dev-impersonation.js";
import type { AuthenticatedRequest, Principal, VerifiedToken } from "./principal.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";

/**
 * Guard global (APP_GUARD) : toute route exige un access token Auth0 valide,
 * sauf celles marquées `@Public()`. **Sécurisé par défaut** — on n'oublie pas
 * de protéger une route, on choisit explicitement de l'ouvrir.
 *
 * Deux étapes : (1) `verifier` prouve le `sub` par la signature ; (2)
 * `resolver` enrichit avec notre `User` local + la tenancy — c'est notre base,
 * pas le token, qui autorise. Un `UnauthorizedException` du resolver (compte
 * inconnu / inactif) est un refus légitime et remonte tel quel.
 *
 * La seconde étape passe par un **port** ({@link PrincipalResolver}) : elle lit
 * un domaine, et la couche technique n'a pas à le connaître. C'est la racine de
 * composition qui relie le port à son implémentation — et c'est aussi pourquoi
 * ce guard s'enregistre là-bas plutôt qu'ici.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly verifier: AccessTokenVerifier,
    private readonly resolver: PrincipalResolver,
    private readonly reflector: Reflector,
    private readonly impersonation: DevImpersonation,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // Bypass de DÉVELOPPEMENT : quand l'impersonation est active (jamais en
    // production, cf. AppConfig), on saute la vérification du jeton et on résout
    // directement le `User` choisi. Le resolver applique les mêmes refus métier
    // (compte inconnu / inactif) que le chemin normal.
    if (this.impersonation.enabled) {
      request.principal = await this.resolver.resolve(
        await this.impersonation.verifiedToken(request),
      );
      attachActor({ type: "customer", id: request.principal.userId });
      return true;
    }

    const token = bearerToken(request.headers.authorization);
    if (token === undefined) {
      throw new UnauthorizedException("Jeton Bearer manquant.");
    }

    request.principal = await this.authenticate(token);
    // Renseigne l'acteur du RequestContext (le principal est résolu) → le journal
    // d'événements attribuera les écritures au bon `customer`.
    attachActor({ type: "customer", id: request.principal.userId });
    return true;
  }

  /** Vérifie la signature puis résout le client local. */
  private async authenticate(token: string): Promise<Principal> {
    let verified: VerifiedToken;
    try {
      verified = await this.verifier.verify(token);
    } catch {
      // On ne relaie jamais le détail interne au client (fuite d'information).
      throw new UnauthorizedException("Jeton invalide ou expiré.");
    }
    // Hors du `try` : les refus métier du resolver (compte inconnu / inactif)
    // portent leur propre message et ne doivent pas être masqués.
    return this.resolver.resolve(verified);
  }

  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }
}

/** Extrait le jeton d'un en-tête `Authorization: Bearer <token>`. */
function bearerToken(header: string | undefined): string | undefined {
  if (header === undefined) {
    return undefined;
  }
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") {
    return undefined;
  }
  return value === undefined || value === "" ? undefined : value;
}
