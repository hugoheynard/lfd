import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import {
  actingCompanyUnreachable,
  currentRequestContext,
} from "../context/request-context.store.js";
import { UnreachableWorkspaceError } from "./unreachable-workspace.error.js";

/**
 * **La société pour laquelle la requête agit**, ou `null`.
 *
 * Résolue par `AuthGuard` à partir des rattachements du principal, jamais reçue
 * d'un client — cf. `resolve-company.ts` pour la déclaration « perso » et les
 * trois branches.
 *
 * Un décorateur de paramètre plutôt qu'une lecture du contexte au fond du code :
 * le contrôleur est la frontière, et c'est là qu'on doit voir d'un coup d'œil
 * qu'une route agit pour une société. Enfouir la lecture ferait d'un fait de
 * sécurité une dépendance invisible.
 *
 * `null` hors requête (cron, semis) : le no-op de l'ALS traverse jusqu'ici, et
 * c'est la bonne réponse — un travail de fond n'agit pour personne.
 *
 * @throws {UnreachableWorkspaceError} l'en-tête désignait une société que la
 *   personne n'atteint plus : la route qui agit pour une société refuse.
 */
export const ActingCompany = createParamDecorator(
  (_data: unknown, _context: ExecutionContext): string | null => {
    if (actingCompanyUnreachable()) {
      throw new UnreachableWorkspaceError();
    }
    return currentRequestContext()?.companyId ?? null;
  },
);
