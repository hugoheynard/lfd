import { PASSWORD_TICKET_TTL_SECONDS } from "./auth0-identity.gateway.js";

/**
 * **Le lien de mot de passe** — la forme du ticket, et sa péremption.
 *
 * Ici, dans la couche technique et à côté de la passerelle qui l'émet, parce que
 * **deux populations** s'en servent : un client à qui le commercial ouvre un
 * accès, et un membre de l'équipe qu'on invite. Ni l'une ni l'autre ne possède
 * la notion — c'est le fournisseur d'identité qui la définit, et le TTL est le
 * sien (d'où l'import, plutôt qu'une seconde définition qui dériverait).
 *
 * Auparavant, `staff-users/` importait cette forme depuis `account/` : le socle
 * staff dépendait donc de la plateforme marchande. Le jour où ce socle se pose
 * devant le PIM, cette dépendance n'aurait aucun sens — un annuaire d'équipe n'a
 * pas à connaître les clients pour inviter quelqu'un.
 */

/** Ce qu'une émission rend : le lien, et jusqu'à quand il ouvre. */
export interface IssuedPasswordLink {
  readonly url: string;
  /** ISO. Calculée sur le TTL réellement demandé au fournisseur. */
  readonly expiresAt: string;
}

/**
 * L'instant où le ticket cesse d'ouvrir, sur le TTL demandé au fournisseur.
 *
 * Calculée côté serveur et non devinée par l'écran : c'est lui qui demande le
 * TTL, lui seul sait combien de temps le ticket ouvre.
 */
export function expiryFrom(now: Date): string {
  return new Date(now.getTime() + PASSWORD_TICKET_TTL_SECONDS * 1000).toISOString();
}
