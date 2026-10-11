import type { VerifiedToken } from "../../../platform/auth/principal.js";

/**
 * Le jeton prouve-t-il l'adresse **actuellement en base** ?
 *
 * Il faut les deux claims, et que l'adresse soit la même (trim + minuscules).
 * Un jeton émis pour l'ancienne adresse ne prouve pas la nouvelle : sans cette
 * comparaison, la requête qui suit un changement d'adresse, portée par le jeton
 * d'accès encore valide, remettait `email_verified` à `true` sur une adresse
 * que personne n'a vérifiée — et l'exemption par adresse prouvée devenait
 * contournable pour toute la durée de vie du jeton (décidé le 2026-09-14).
 *
 * Claim d'adresse absent ou adresse différente : « on ne sait pas », qui
 * n'efface ni ne prouve. En dépendent la recopie de la preuve
 * (`CustomerPrincipalResolver.record`) et, depuis le 2026-10-11, le
 * rattachement d'une fiche invité (`GuestAccountClaim`) — ni le
 * provisionnement au vol, ni l'activation de l'invité.
 *
 * Sorti du résolveur le 2026-10-11 pour servir ces deux lecteurs.
 */
export function tokenProvesAddress(token: VerifiedToken, storedEmail: string): boolean {
  return (
    token.emailVerified === true &&
    token.email !== undefined &&
    normalizeEmail(token.email) === normalizeEmail(storedEmail)
  );
}

/** Forme de comparaison d'une adresse : la casse et les blancs ne font pas une autre adresse. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
