import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AccessTokenVerifier } from "./access-token.verifier.js";
import { AdminAuthGuard } from "./admin-auth.guard.js";
import { AdminTokenVerifier } from "./admin-token.verifier.js";
import { AuthConfig } from "./auth.config.js";
import { AuthGuard } from "./auth.guard.js";
import { CustomerUserResolver } from "./customer-user.resolver.js";
import { DevImpersonation } from "./dev-impersonation.js";
import { StaffAccessGuard } from "./staff-access.guard.js";
import { StaffAccessResolver } from "./staff-access.resolver.js";

/**
 * Couche infrastructure : authentification Auth0 (OIDC) enrichie B2B.
 * Le guard client est branché via `APP_GUARD` → l'API est **protégée par
 * défaut**. On expose le vérificateur et le resolver, réutilisables hors du guard.
 *
 * `DevImpersonation` est le bypass de développement du guard : inerte en prod
 * (garde-fou dans `AppConfig`), il n'est là que pour travailler en local sans
 * jeton Auth0.
 *
 * Surface **staff** (Invariant C) : `AdminTokenVerifier` + `AdminAuthGuard`
 * portent une audience distincte du client, et `StaffAccessGuard` +
 * `StaffAccessResolver` disent ce que la personne a le droit de faire. Aucun de
 * ces guards n'est global : ils s'attachent ensemble par `@AdminSurface(...)` sur
 * les contrôleurs `/admin/*`, et sont exportés ici pour qu'ils s'y résolvent.
 */
@Global()
@Module({
  providers: [
    AuthConfig,
    AccessTokenVerifier,
    CustomerUserResolver,
    DevImpersonation,
    AdminTokenVerifier,
    AdminAuthGuard,
    StaffAccessResolver,
    StaffAccessGuard,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [
    AccessTokenVerifier,
    CustomerUserResolver,
    AdminTokenVerifier,
    AdminAuthGuard,
    StaffAccessResolver,
    StaffAccessGuard,
  ],
})
export class AuthModule {}
