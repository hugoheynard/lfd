import type { Prisma } from "../../../../platform/database/client/client.js";
import { oldestLiveInvitation } from "../../../../platform/shared/invitation/invitation-expiry.js";

/**
 * **Un rattachement OUVRE-t-il sa société ?** — la même règle que
 * `opensCompany` (`lafoliecoffee/account/domain/services/membership-entry.ts`), écrite
 * en condition de requête : accepté, OU non accepté et invitation vivante
 * (`invited_at >= oldestLiveInvitation(now)`, la borne même de
 * `isInvitationAlive`).
 *
 * 🔴 Tout lecteur qui DÉCIDE d'un accès à partir de `memberships` la porte
 * dans son `where` (2026-10-10, §8.1 bis de
 * `architecture-compte-client-cycle-de-vie.md`). Le `Principal` ne suffisait
 * pas : six gardes relisaient le rattachement en base par le `companyId` de
 * l'URL, et une personne active par B gardait l'accès à A, invitation
 * expirée — RIB compris.
 *
 * Dans `lafoliecoffee/shared/` parce que la règle est celle de tout le bloc : le mur
 * d'une société vaut pour les commandes, le paiement, la fidélité, les
 * alertes et le compte, qui ne s'importent pas entre eux. `now` vient du
 * `Clock` de l'appelant.
 */
export function openingMembership(now: Date): Prisma.MembershipWhereInput {
  return {
    OR: [{ acceptedAt: { not: null } }, { invitedAt: { gte: oldestLiveInvitation(now) } }],
  };
}

/**
 * **Le rattachement qui porte une commande SAISIE PAR L'ÉQUIPE** : toute
 * appartenance à la société, acceptée ou non, invitation vivante ou expirée,
 * tant que le compte de la personne n'est pas désactivé. Décidé par Hugo le
 * 2026-11-23 : une commande prise par l'équipe passe dans tous les cas, le
 * client n'a pas à s'être connecté pour être livré.
 *
 * Ne sert qu'à DÉSIGNER à qui la commande est portée par l'équipe : n'ouvre
 * aucun accès. Le mur tient toujours — la personne est rattachée à CETTE
 * société, et un compte désactivé ne porte plus rien.
 */
export function staffBuyerMembership(): Prisma.MembershipWhereInput {
  return { user: { status: { not: "disabled" } } };
}
