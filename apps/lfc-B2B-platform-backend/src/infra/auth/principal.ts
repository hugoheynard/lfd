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
 * décide l'autorisation — `userId`, `email` et les rattachements. Les `scopes`,
 * eux, restent portés par le token.
 *
 * ⚠️ Il n'y a **pas** de `companyId` unique ici, et c'est délibéré : une personne
 * peut n'être rattachée à **aucune** société (compte tout juste créé, « Mes
 * entreprises » vide) ou à plusieurs. Un endpoint muré ne peut donc plus déduire
 * son tenant du `Principal` : il doit recevoir la société visée et la **vérifier**
 * contre `memberships`. Reconstruire un `companyId` d'office (« la première »)
 * serait exactement le raccourci qui fuit.
 */
export interface Principal {
  /** Claim `sub` Auth0 — identité externe. */
  readonly subject: string;
  /** Id de notre `User` local (identité interne, autoritaire). */
  readonly userId: string;
  /** E-mail de la personne (depuis notre base, pas depuis le token). */
  readonly email: string;
  /** Sociétés auxquelles la personne est rattachée — possiblement aucune. */
  readonly memberships: readonly PrincipalMembership[];
  /** Scopes accordés par le token. */
  readonly scopes: readonly string[];
}

/** Rattachement de la personne à une société, avec son rôle dans celle-ci. */
export interface PrincipalMembership {
  /** Tenant — le mur d'isolation. */
  readonly companyId: string;
  /** Rôle de la personne dans CETTE société (il varie d'une société à l'autre). */
  readonly role: CustomerRole;
}

/** Requête HTTP enrichie par `AuthGuard` après vérification + résolution. */
export type AuthenticatedRequest = Request & { principal?: Principal };
