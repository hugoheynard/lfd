import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AccessTokenVerifier } from "./access-token.verifier.js";
import { AuthConfig } from "./auth.config.js";
import { AuthGuard } from "./auth.guard.js";
import { CustomerUserResolver } from "./customer-user.resolver.js";

/**
 * Couche infrastructure : authentification Auth0 (OIDC) enrichie B2B.
 * Le guard est branché via `APP_GUARD` → l'API est **protégée par défaut**.
 * On expose le vérificateur et le resolver, réutilisables hors du guard.
 */
@Global()
@Module({
  providers: [
    AuthConfig,
    AccessTokenVerifier,
    CustomerUserResolver,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AccessTokenVerifier, CustomerUserResolver],
})
export class AuthModule {}
