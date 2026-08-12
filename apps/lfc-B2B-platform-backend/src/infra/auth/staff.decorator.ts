import { createParamDecorator, ForbiddenException, type ExecutionContext } from "@nestjs/common";

import type { AuthenticatedStaffRequest } from "./staff-principal.js";

/**
 * Le `sub` du staff qui fait la requête, posé par l'`AdminAuthGuard`.
 *
 * Un **identifiant**, pas un nom : il reste résolvable après un changement de
 * nom ou de rôle, et c'est ce qu'on veut figer dans une trace — « qui a coupé
 * les alertes sur ce compte » doit rester répondable dans six mois.
 *
 * `unknown-staff` n'arrive que si la route oublie le guard : le décorateur ne
 * peut pas le garantir, et écrire un marqueur visible vaut mieux que planter une
 * requête par ailleurs valide.
 */
export const StaffSub = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedStaffRequest>();
    return request.staff?.subject ?? "unknown-staff";
  },
);

/**
 * L'id de la **fiche** d'annuaire de la personne qui appelle, posé par
 * `StaffAccessGuard`.
 *
 * Contrairement à {@link StaffSub}, pas de valeur de repli : le guard refuse la
 * requête quand il ne résout personne, donc arriver ici sans fiche serait un
 * montage cassé — mieux vaut le voir tout de suite qu'inventer un identifiant
 * qui ne désigne rien.
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
