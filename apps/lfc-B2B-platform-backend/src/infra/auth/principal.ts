import type { Request } from "express";
import type { CustomerRole } from "../database/client/client.js";

/**
 * Jeton Auth0 **vérifié** — ce que la signature prouve, et rien de plus.
 *
 * Le token atteste seulement du `subject` (claim `sub`) et des `scopes`
 * accordés. Il ne dit RIEN de faisant autorité sur qui est l'utilisateur chez
 * nous : notre base tranche cela (cf. `CustomerUserResolver`).
 */
export interface VerifiedToken {
  readonly subject: string;
  /** Scopes accordés (claim `scope`, séparés par des espaces). */
  readonly scopes: readonly string[];
}

/**
 * Identité **enrichie** d'un client B2B, portée par une requête authentifiée.
 *
 * `subject` vient du token (identité externe Auth0). Tout le reste est
 * **autoritaire depuis notre base** : le token prouve le `sub`, notre `User`
 * décide l'autorisation — `userId`, `companyId` (le mur de tenancy), `role` et
 * `email`. Les `scopes`, eux, restent portés par le token.
 */
export interface Principal {
  /** Claim `sub` Auth0 — identité externe. */
  readonly subject: string;
  /** Id de notre `User` local (identité interne, autoritaire). */
  readonly userId: string;
  /** Tenant du client — le mur d'isolation. */
  readonly companyId: string;
  /** Rôle du client dans sa société. */
  readonly role: CustomerRole;
  /** E-mail du client (depuis notre base, pas depuis le token). */
  readonly email: string;
  /** Scopes accordés par le token. */
  readonly scopes: readonly string[];
}

/** Requête HTTP enrichie par `AuthGuard` après vérification + résolution. */
export type AuthenticatedRequest = Request & { principal?: Principal };
