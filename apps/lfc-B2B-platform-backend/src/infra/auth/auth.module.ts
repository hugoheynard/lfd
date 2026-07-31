import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AccessTokenVerifier } from "./access-token.verifier.js";
import { AuthConfig } from "./auth.config.js";
import { AuthGuard } from "./auth.guard.js";
import { CustomerUserResolver } from "./customer-user.resolver.js";
import { DevImpersonation } from "./dev-impersonation.js";

/**
 * Couche infrastructure : authentification Auth0 (OIDC) enrichie B2B.
 * Le guard est branché via `APP_GUARD` → l'API est **protégée par défaut**.
 * On expose le vérificateur et le resolver, réutilisables hors du guard.
 *
 * `DevImpersonation` est le bypass de développement du guard : inerte en prod
 * (garde-fou dans `AppConfig`), il n'est là que pour travailler en local sans
 * jeton Auth0.
 */
@Global()
@Module({
  providers: [
    AuthConfig,
    AccessTokenVerifier,
    CustomerUserResolver,
    DevImpersonation,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AccessTokenVerifier, CustomerUserResolver],
})
export class AuthModule {}
