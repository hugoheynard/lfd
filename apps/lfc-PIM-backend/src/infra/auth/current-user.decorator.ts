import {
  UnauthorizedException,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthenticatedRequest, Principal } from './principal.js';

/**
 * Injecte l'identité vérifiée dans un handler.
 * À n'utiliser que sur une route protégée : sur une route `@Public()`, aucune
 * identité n'a été établie.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { principal } = request;
    if (principal === undefined) {
      throw new UnauthorizedException(
        'Aucune identité sur la requête (route publique ou guard absent).',
      );
    }
    return principal;
  },
);
