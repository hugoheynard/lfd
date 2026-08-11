import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

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
