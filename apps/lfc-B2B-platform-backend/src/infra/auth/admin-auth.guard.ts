import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";

import { AppConfig } from "../config/app-config.js";
import { attachActor } from "../context/request-context.store.js";
import { AdminTokenVerifier } from "./admin-token.verifier.js";
import type { AuthenticatedStaffRequest, StaffPrincipal } from "./staff-principal.js";

/** Identité synthétique du bypass de dev — jamais atteinte en prod. */
const DEV_STAFF: StaffPrincipal = { subject: "dev-staff", scopes: [] };

/**
 * Guard de la surface **admin** (`/admin/*`) : porte STAFF, distincte du guard
 * client global. On l'attache par `@UseGuards(AdminAuthGuard)` sur les
 * contrôleurs admin, qui sont aussi `@Public()` — le guard client global les
 * laisse alors passer, et **celui-ci** prend le relais.
 *
 * Deux chemins, comme côté client :
 * - **bypass de DÉVELOPPEMENT** (`AUTH_ADMIN_DEV_BYPASS=true`, fail-closed en
 *   prod via `AppConfig`) : on saute la vérification et on pose un staff
 *   synthétique — pour travailler en local sans tenant Auth0 staff.
 * - **prod** : vérifie le bearer contre l'audience staff (`AdminTokenVerifier`).
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly config: AppConfig,
    private readonly verifier: AdminTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedStaffRequest>();

    if (this.config.adminDevBypass()) {
      request.staff = DEV_STAFF;
      attachActor({ type: "staff", id: DEV_STAFF.subject });
      return true;
    }

    const token = bearerToken(request.headers.authorization);
    if (token === undefined) {
      throw new UnauthorizedException("Jeton Bearer staff manquant.");
    }
    try {
      request.staff = await this.verifier.verify(token);
    } catch {
      // On ne relaie jamais le détail interne (fuite d'information).
      throw new UnauthorizedException("Jeton staff invalide ou expiré.");
    }
    // Acteur `staff` dans le RequestContext → les mutations back-office seront
    // attribuées au bon sujet dans le journal d'événements.
    attachActor({ type: "staff", id: request.staff.subject });
    return true;
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
