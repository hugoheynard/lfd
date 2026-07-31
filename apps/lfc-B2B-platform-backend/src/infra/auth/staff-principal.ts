import type { Request } from "express";

/**
 * Identité **staff** (app admin), portée par une requête admin authentifiée.
 *
 * Distincte du `Principal` client (Invariant C : le token client n'est JAMAIS
 * réutilisé côté admin). Ici l'autorisation vient du **JWT staff** (audience
 * dédiée), pas d'un `User` de la base commerce : le staff n'est pas un client.
 * Pour cette 1ʳᵉ tranche, « porter un token staff valide » suffit — un annuaire
 * staff plus fin viendra si le besoin de rôles apparaît.
 */
export interface StaffPrincipal {
  /** Claim `sub` du token staff. */
  readonly subject: string;
  /** Scopes accordés par le token staff. */
  readonly scopes: readonly string[];
}

/** Requête HTTP enrichie par `AdminAuthGuard` après vérification. */
export type AuthenticatedStaffRequest = Request & { staff?: StaffPrincipal };
