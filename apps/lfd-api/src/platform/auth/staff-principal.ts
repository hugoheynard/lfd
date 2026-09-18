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
  /**
   * Claim `email_verified`. Le premier rapprochement l'**exige** à `true` :
   * sans preuve de la boîte, une adresse n'est qu'une chaîne que n'importe qui
   * peut taper à l'inscription. Absent vaut refus.
   */
  readonly emailVerified: boolean | undefined;
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
 * Requête HTTP vue par une surface admin : **l'accès, et lui seul**.
 *
 * `StaffAccessGuard` pose `access` — la fiche, son rôle, ses permissions. Le
 * `StaffPrincipal` que le jeton a prouvé n'y figure **pas** : il passe d'un
 * garde à l'autre par un canal interne à `platform/auth/`
 * (`verified-staff-identity.ts`) et s'efface une fois la fiche résolue. Un
 * contrôleur ne peut donc plus lire un `sub` staff, ni l'écrire comme auteur —
 * par le type, pas par une règle (plan de l'auteur, D2, 2026-09-18).
 */
export type AuthenticatedStaffRequest = Request & {
  access?: StaffAccess;
};
