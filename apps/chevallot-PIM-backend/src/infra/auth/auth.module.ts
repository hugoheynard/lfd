import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessTokenVerifier } from './access-token.verifier.js';
import { AuthConfig } from './auth.config.js';
import { AuthGuard } from './auth.guard.js';

/**
 * Couche infrastructure : authentification Auth0 (OIDC).
 * Le guard est branché via `APP_GUARD` → l'API est **protégée par défaut**.
 */
@Global()
@Module({
  providers: [
    AuthConfig,
    AccessTokenVerifier,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AccessTokenVerifier],
})
export class AuthModule {}
