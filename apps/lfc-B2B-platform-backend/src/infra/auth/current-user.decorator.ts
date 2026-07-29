import { createParamDecorator, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import type { AuthenticatedRequest, Principal } from "./principal.js";

/**
 * Injecte le `Principal` du client authentifié dans un handler de contrôleur.
 *
 * Le guard global l'a posé sur la requête après vérification + résolution. Sur
 * une route protégée, il est donc toujours présent ; son absence signale une
 * route mal configurée (oubli de protection) — d'où le 401 défensif plutôt
 * qu'un `Principal` potentiellement `undefined` propagé dans le domaine.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.principal === undefined) {
      throw new UnauthorizedException("Utilisateur non authentifié.");
    }
    return request.principal;
  },
);
