import {
  hasStaffPermission,
  staffPermission,
  type StaffAction,
  type StaffPermission,
  type StaffResource,
} from "@lfd/contracts";
import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import {
  ADMIN_PERMISSION_KEY,
  ADMIN_RESOURCE_KEY,
  ADMIN_SELF_KEY,
} from "./admin-surface.decorator.js";
import { StaffAccessResolver } from "./staff-access.resolver.js";
import type { AuthenticatedStaffRequest } from "./staff-principal.js";

/** Les verbes qui ne modifient rien. Tout le reste demande l'écriture. */
const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Le **mur** de la surface admin : `AdminAuthGuard` dit qui se présente, ce
 * guard dit ce que cette personne a le droit de faire.
 *
 * Il est **fail-closed sur trois plans**, et c'est voulu :
 * - pas d'identité staff sur la requête ⇒ refus (le guard d'entrée n'a pas tourné) ;
 * - pas de ressource déclarée ⇒ refus (un contrôleur admin qui oublie
 *   `@AdminSurface` n'ouvre rien) ;
 * - `sub` inconnu de l'annuaire, ou fiche suspendue ⇒ refus.
 *
 * Un `403` faux est réparable ; un `200` faux ne l'est pas.
 */
@Injectable()
export class StaffAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly resolver: StaffAccessResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedStaffRequest>();
    const principal = request.staff;
    if (principal === undefined) {
      throw new ForbiddenException("Identité staff absente.");
    }

    // On calcule l'exigence AVANT de résoudre : une surface mal montée doit être
    // refusée même si la personne aurait tous les droits.
    //
    // Une permission déclarée explicitement l'emporte sur le caractère réflexif :
    // sinon `@RequirePermission` posée sur `/admin/me` serait ignorée en silence,
    // et on croirait avoir restreint une route qui ne l'est pas.
    const explicit = this.declaredPermission(context);
    const required =
      explicit ??
      (this.isReflexive(context) ? null : this.resourcePermission(context, request.method));

    const access = await this.resolver.resolve(principal);
    if (access === null) {
      // On ne dit pas « vous n'êtes pas dans l'annuaire » : le message ne
      // distingue pas l'inconnu du non-autorisé.
      throw new ForbiddenException("Accès refusé.");
    }
    if (required !== null && !hasStaffPermission(access.permissions, required)) {
      throw new ForbiddenException("Accès refusé.");
    }
    request.access = access;
    return true;
  }

  /** Vrai pour la surface réflexive (`/admin/me`), qui n'exige aucune permission. */
  private isReflexive(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean | undefined>(ADMIN_SELF_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }

  /** La permission que la route déclare explicitement, s'il y en a une. */
  private declaredPermission(context: ExecutionContext): StaffPermission | undefined {
    return this.reflector.getAllAndOverride<StaffPermission | undefined>(ADMIN_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  }

  /** À défaut de déclaration : la ressource de la surface, et le verbe pour l'action. */
  private resourcePermission(context: ExecutionContext, method: string): StaffPermission {
    const resource = this.reflector.getAllAndOverride<StaffResource | undefined>(
      ADMIN_RESOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (resource === undefined) {
      throw new ForbiddenException("Surface admin sans ressource déclarée.");
    }
    return staffPermission(resource, actionFor(method));
  }
}

/** Le verbe HTTP dit l'intention : lire ou écrire. */
function actionFor(method: string): StaffAction {
  return READ_ONLY_METHODS.has(method.toUpperCase()) ? "read" : "write";
}
