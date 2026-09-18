import { PASSWORD_TICKET_TTL_SECONDS } from "../../identity/auth0-identity.gateway.js";

/**
 * Combien de temps une **invitation** reste valable — la règle, pour tout le
 * monde.
 *
 * Ce n'est pas une contrainte qu'on invente : une invitation **est** un lien de
 * mot de passe, et ce lien meurt chez le fournisseur d'identité au bout de
 * {@link PASSWORD_TICKET_TTL_SECONDS}. La règle en est donc **dérivée**, pas
 * recopiée : une invitation vit exactement aussi longtemps que son lien.
 *
 * ⚠️ Elle valait **14 jours** jusqu'au 2026-09-18, tandis que le lien en vivait
 * 7 — et les e-mails annonçaient 7. Du 8ᵉ au 14ᵉ jour, la fiche affichait
 * « invitée » sur un lien mort. Deux nombres écrits séparément pour dire la
 * même chose finissent toujours par diverger.
 *
 * **Aucun balayage n'existe, et aucun n'est nécessaire** : le lien se révoque
 * tout seul chez Auth0. Cette règle ne sert qu'à le **dire** à l'écran ; le
 * geste de sortie est le renvoi, qui frappe un lien neuf.
 *
 * Elle vit dans `shared/` parce qu'elle a **deux** usagers — le contact d'une
 * société cliente et le membre de l'équipe. Une invitation périmée doit l'être
 * partout le même jour, ou « périmée » ne veut plus rien dire.
 */
const INVITATION_LIFETIME_MS = PASSWORD_TICKET_TTL_SECONDS * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** La même durée, en jours — pour les messages et les tests. */
export const INVITATION_LIFETIME_DAYS = INVITATION_LIFETIME_MS / DAY_MS;

/** Jusqu'à quand cette invitation vaut. */
export function invitationExpiresAt(invitedAt: Date): Date {
  return new Date(invitedAt.getTime() + INVITATION_LIFETIME_MS);
}

/**
 * L'invitation est-elle **périmée** ?
 *
 * Fonction **pure** : la même règle sert les deux annuaires — les contacts
 * d'une société et l'équipe. Écrite deux fois, elle finirait par donner deux
 * réponses, et l'une des deux serait celle qu'on ne teste jamais.
 *
 * La borne est **inclusive côté vie** : à la milliseconde exacte, l'invitation
 * vaut encore. Un accès ne se ferme pas sur une égalité d'horloge.
 */
export function isInvitationExpired(invitedAt: Date, now: Date): boolean {
  return now.getTime() > invitationExpiresAt(invitedAt).getTime();
}
