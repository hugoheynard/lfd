import { isInvitationAlive } from "../../../../platform/shared/invitation/invitation-expiry.js";

/** Ce que l'entrée lit d'un rattachement : son invitation, et si elle a été acceptée. */
export interface MembershipInvitation {
  readonly invitedAt: Date;
  /** `null` : la personne n'est pas encore entrée par ce rattachement. */
  readonly acceptedAt: Date | null;
}

/**
 * **Un rattachement ouvre-t-il sa société ?** (2026-10-10,
 * `architecture-compte-client-cycle-de-vie.md` §8.1 bis, point 1.)
 *
 * Oui s'il a été accepté — la personne est entrée par lui —, ou si son
 * invitation vit encore. Une invitation expirée n'ouvre rien, même à une
 * personne active ailleurs : le statut `invited` est porté par la PERSONNE,
 * et c'est ce qui laissait une société A s'ouvrir pour toujours à qui entrait
 * par B (objection B2 de `vitruve`).
 */
export function opensCompany(membership: MembershipInvitation, now: Date): boolean {
  return membership.acceptedAt !== null || isInvitationAlive(membership.invitedAt, now);
}

/** Un rattachement que cette entrée doit accepter : pas encore accepté, invitation vivante. */
export function awaitsAcceptance(membership: MembershipInvitation, now: Date): boolean {
  return membership.acceptedAt === null && isInvitationAlive(membership.invitedAt, now);
}

/**
 * **Une personne `invited` peut-elle entrer ?** Seulement si au moins un de
 * ses rattachements l'accueille : accepté (un état que seule une entrée
 * antérieure pose), ou invitation vivante. Sinon, l'entrée est refusée.
 */
export function canEnter(memberships: readonly MembershipInvitation[], now: Date): boolean {
  return memberships.some((membership) => opensCompany(membership, now));
}
