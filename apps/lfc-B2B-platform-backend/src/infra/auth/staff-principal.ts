import type { StaffPermission, StaffRole } from "@lfd/contracts";
import type { Request } from "express";

/**
 * Ce que le **jeton** staff prouve — et rien de plus : « ce porteur est ce
 * `sub` », plus l'adresse quand le tenant la pose en claim.
 *
 * Distinct du `Principal` client (Invariant C : le token client n'est JAMAIS
 * réutilisé côté admin). **Le jeton ne porte aucun droit** : ils sont lus dans
 * l'annuaire à chaque requête, pour qu'une révocation prenne effet en secondes
 * plutôt qu'à l'expiration du jeton.
 */
export interface StaffPrincipal {
  /** Claim `sub` du token staff. */
  readonly subject: string;
  /** Claim `email`, quand le tenant la pose. Sert au **premier** rapprochement. */
  readonly email: string | undefined;
  /** Scopes du token staff. Conservés pour la trace, jamais pour autoriser. */
  readonly scopes: readonly string[];
}

/**
 * Qui est cette personne **chez nous**, et ce qu'elle a le droit de faire.
 * Résolu depuis l'annuaire, jamais depuis le jeton.
 */
export interface StaffAccess {
  readonly staffUserId: string;
  readonly role: StaffRole;
  readonly permissions: readonly StaffPermission[];
}

/**
 * Requête HTTP enrichie par les deux portes : `AdminAuthGuard` pose `staff`
 * (qui se présente), `StaffAccessGuard` pose `access` (ce qu'il peut faire).
 */
export type AuthenticatedStaffRequest = Request & {
  staff?: StaffPrincipal;
  access?: StaffAccess;
};
