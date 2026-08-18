import type { StaffPermission, StaffResource } from "@lfd/contracts";
import { applyDecorators, SetMetadata, UseGuards } from "@nestjs/common";

import { AdminAuthGuard } from "./admin-auth.guard.js";
import { Public } from "./public.decorator.js";
import { StaffAccessGuard } from "./staff-access.guard.js";

/** Clé de la ressource déclarée par un contrôleur admin. */
export const ADMIN_RESOURCE_KEY = "admin:resource";

/** Clé de la permission explicitement exigée par une route. */
export const ADMIN_PERMISSION_KEY = "admin:permission";

/**
 * Déclare un contrôleur comme **surface admin** portant sur une ressource.
 *
 * Un seul décorateur monte les trois choses qui allaient toujours ensemble :
 * `@Public()` désarme le guard client global, `AdminAuthGuard` réarme la porte
 * staff, et `StaffAccessGuard` vérifie le périmètre. Les tenir séparés, c'était
 * accepter qu'on en oublie un — et un contrôleur admin sans son mur ne se voit
 * pas à la lecture.
 *
 * **L'action se déduit du verbe HTTP** : `GET`/`HEAD` demandent `read`, tout le
 * reste demande `write`. Le défaut est juste dans l'écrasante majorité des cas,
 * et {@link RequirePermission} couvre l'exception (un `POST` qui ne fait que
 * chercher, par exemple).
 *
 * **Fail-closed** : une route admin sans ressource déclarée est refusée. Ajouter
 * un contrôleur en oubliant ce décorateur donne un `403`, jamais un accès.
 */
export function AdminSurface(resource: StaffResource): ClassDecorator {
  return applyDecorators(
    Public(),
    UseGuards(AdminAuthGuard, StaffAccessGuard),
    SetMetadata(ADMIN_RESOURCE_KEY, resource),
  );
}

/**
 * Exige une permission **précise** sur une route, au lieu de celle que le verbe
 * HTTP impliquerait. À réserver aux cas où le verbe ment sur l'intention.
 */
export function RequirePermission(permission: StaffPermission): MethodDecorator {
  return SetMetadata(ADMIN_PERMISSION_KEY, permission);
}

/** Clé d'une surface qui ne parle que de **soi**. */
export const ADMIN_SELF_KEY = "admin:self";

/**
 * Surface **réflexive** : « qui suis-je et que puis-je faire ».
 *
 * Elle exige une identité staff résolue — donc une fiche connue et non
 * suspendue — mais **aucune permission** : sinon il faudrait un droit pour
 * apprendre qu'on n'en a aucun, et l'écran ne pourrait même pas se dessiner.
 * C'est la seule exception au modèle, et elle ne lit rien d'autre que soi.
 */
export function AdminSelfSurface(): ClassDecorator {
  return applyDecorators(
    Public(),
    UseGuards(AdminAuthGuard, StaffAccessGuard),
    SetMetadata(ADMIN_SELF_KEY, true),
  );
}
