import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";

import { AppConfig } from "../config/app-config.js";
import { AdminTokenVerifier } from "./admin-token.verifier.js";
import type { AuthenticatedStaffRequest } from "./staff-principal.js";
import { depositVerifiedStaff } from "./verified-staff-identity.js";

/** Le `sub` synthétique du bypass de dev — jamais atteint en prod. */
const DEV_STAFF_SUBJECT = "dev-staff";

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
 *
 * Il **n'attache pas d'acteur** et ne pose rien de lisible sur la requête : ce
 * qu'il prouve est un `sub`, et un `sub` n'est pas un auteur. Il le dépose dans
 * le canal interne des deux gardes ; `StaffAccessGuard` en fait une fiche, et
 * c'est lui qui pose l'acteur — l'id de cette fiche (plan de l'auteur, D1/D2).
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
      // L'identité synthétique porte l'e-mail de l'**admin racine** pour que la
      // résolution d'accès emprunte le chemin normal (rapprochement par adresse)
      // et rende un vrai périmètre. Sans ça, poser le mur aurait fermé le poste
      // de travail local le jour même.
      depositVerifiedStaff(request, {
        subject: DEV_STAFF_SUBJECT,
        email: this.config.bootstrapAdminEmail(),
        // Le poste local n'a pas de boîte à prouver : l'adresse est celle que
        // la configuration désigne, pas celle qu'un inconnu a tapée.
        emailVerified: true,
        scopes: [],
      });
      return true;
    }

    const token = bearerToken(request.headers.authorization);
    if (token === undefined) {
      throw new UnauthorizedException("Jeton Bearer staff manquant.");
    }
    try {
      depositVerifiedStaff(request, await this.verifier.verify(token));
    } catch {
      // On ne relaie jamais le détail interne (fuite d'information).
      throw new UnauthorizedException("Jeton staff invalide ou expiré.");
    }
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
