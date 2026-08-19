import { Global, Module } from "@nestjs/common";
import { AccessTokenVerifier } from "./access-token.verifier.js";
import { AdminAuthGuard } from "./admin-auth.guard.js";
import { AdminTokenVerifier } from "./admin-token.verifier.js";
import { AuthConfig } from "./auth.config.js";
import { DevImpersonation } from "./dev-impersonation.js";
import { StaffAccessGuard } from "./staff-access.guard.js";

/**
 * Couche infrastructure : authentification Auth0 (OIDC).
 *
 * Le guard client (`AuthGuard`) n'est PAS enregistré ici : il dépend du port
 * {@link PrincipalResolver}, dont l'implémentation vit dans `account/`. Le
 * brancher ici obligerait cette couche technique à importer un domaine. Il est
 * donc déclaré à la **racine de composition** (`app.module.ts`), seul endroit
 * qui a le droit de connaître tout le monde — l'API reste protégée par défaut,
 * c'est le lieu de la déclaration qui change.
 *
 * On expose le vérificateur et le bypass de développement, réutilisables hors
 * du guard.
 *
 * `DevImpersonation` est le bypass de développement du guard : inerte en prod
 * (garde-fou dans `AppConfig`), il n'est là que pour travailler en local sans
 * jeton Auth0.
 *
 * Surface **staff** (Invariant C) : `AdminTokenVerifier` + `AdminAuthGuard`
 * portent une audience distincte du client, et `StaffAccessGuard` dit ce que la
 * personne a le droit de faire. Aucun de ces guards n'est global : ils
 * s'attachent ensemble par `@AdminSurface(...)` sur les contrôleurs `/admin/*`,
 * et sont exportés ici pour qu'ils s'y résolvent.
 *
 * Le **port** `StaffAccessResolver` est déclaré ici, jamais implémenté :
 * répondre suppose de lire l'annuaire, et cette couche n'a pas à le connaître.
 * C'est la racine de composition qui relie le port à son adaptateur — même
 * geste que pour `PrincipalResolver` côté client, même raison.
 */
@Global()
@Module({
  providers: [
    AuthConfig,
    AccessTokenVerifier,
    DevImpersonation,
    AdminTokenVerifier,
    AdminAuthGuard,
    StaffAccessGuard,
  ],
  exports: [
    AccessTokenVerifier,
    DevImpersonation,
    AdminTokenVerifier,
    AdminAuthGuard,
    StaffAccessGuard,
  ],
})
export class AuthModule {}
