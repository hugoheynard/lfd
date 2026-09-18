import { createParamDecorator, ForbiddenException, type ExecutionContext } from "@nestjs/common";

import type { AuthenticatedStaffRequest } from "./staff-principal.js";

/**
 * L'id de la **fiche** d'annuaire de la personne qui appelle, posé par
 * `StaffAccessGuard`.
 *
 * **Le seul auteur qu'une route staff puisse écrire.** Un identifiant chez nous,
 * pas chez le fournisseur de connexion : il survit à un changement de nom, de
 * rôle ou d'identifiant de connexion, et c'est ce qu'on veut figer dans une
 * trace — « qui a coupé les alertes sur ce compte » doit rester répondable
 * dans six mois. Le décorateur qui servait le `sub` a été retiré le 2026-09-18
 * (plan de l'auteur, D2).
 *
 * Pas de valeur de repli : le guard refuse la requête quand il ne résout
 * personne, donc arriver ici sans fiche serait un montage cassé — mieux vaut le
 * voir tout de suite qu'inventer un identifiant qui ne désigne rien.
 */
export const StaffUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedStaffRequest>();
    const staffUserId = request.access?.staffUserId;
    if (staffUserId === undefined) {
      throw new ForbiddenException("Accès staff non résolu.");
    }
    return staffUserId;
  },
);
