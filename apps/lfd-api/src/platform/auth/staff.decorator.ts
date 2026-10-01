import { createParamDecorator, ForbiddenException, type ExecutionContext } from "@nestjs/common";
import type { StaffPermission } from "@lfd/contracts";

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

/**
 * Les permissions **résolues** de la personne qui appelle, posées par
 * `StaffAccessGuard` — pour une route dont la surface est ouverte mais dont
 * une PARTIE de la réponse relève d'un autre droit (la procédure de livraison
 * sur la feuille de route, `plan-droits-par-geste.md`, DG-D8).
 *
 * Le contrôleur en tire une intention (« avec ou sans procédure ») qu'il passe
 * à la query : le masquage se fait au serveur, dans la lecture — pas à l'écran.
 *
 * Même refus que {@link StaffUserId} sans accès résolu : un montage cassé, pas
 * un lecteur sans droit, et on ne lui invente pas une liste vide.
 */
export const StaffPermissions = createParamDecorator(
  (_data: unknown, context: ExecutionContext): readonly StaffPermission[] => {
    const request = context.switchToHttp().getRequest<AuthenticatedStaffRequest>();
    const permissions = request.access?.permissions;
    if (permissions === undefined) {
      throw new ForbiddenException("Accès staff non résolu.");
    }
    return permissions;
  },
);
