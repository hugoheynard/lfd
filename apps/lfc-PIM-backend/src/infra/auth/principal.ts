import type { Request } from 'express';

/**
 * Identité vérifiée, portée par un access token Auth0.
 *
 * `subject` est le claim `sub` d'Auth0 — un identifiant **externe**. Le domaine
 * (et l'`actor` des events) doit référencer notre **propre** id utilisateur,
 * relié au `sub` par une table de correspondance : changer d'IdP reste alors
 * indolore. Cf. `documentation/lfc/todo.md`.
 */
export interface Principal {
  readonly subject: string;
  /** Scopes accordés (claim `scope`, séparés par des espaces). */
  readonly scopes: readonly string[];
}

/** Requête HTTP enrichie par `AuthGuard` après vérification du jeton. */
export type AuthenticatedRequest = Request & { principal?: Principal };
