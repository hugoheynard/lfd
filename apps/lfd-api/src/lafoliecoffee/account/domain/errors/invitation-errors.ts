import {
  AuthorizationError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * **La personne invitée se connecte, mais aucune de ses invitations ne vit
 * encore** (2026-10-10, `architecture-compte-client-cycle-de-vie.md` §8.1 bis).
 *
 * Avant ce refus, une connexion par code ou par Google sous l'adresse d'un
 * invité passait la personne `active` des mois après son invitation, et la
 * société s'ouvrait. Le refus est une **403** : l'identité est prouvée, c'est
 * l'accès qui ne l'est plus. Le geste de sortie appartient au commercial — un
 * lien neuf depuis la fiche de la société —, d'où le message, et la cloche qui
 * le prévient.
 *
 * Le code est stable : la boutique le reconnaît pour afficher le message au
 * lieu de laisser chaque écran prendre son propre refus.
 */
export class InvitationExpiredError extends AuthorizationError {
  constructor(readonly userId: string) {
    super(
      "account.invitation.expired",
      "Votre invitation a expiré. Demandez un nouvel accès à votre interlocuteur La Folie Coffee.",
    );
  }
}

/**
 * **Un lien est demandé pour une société où cette personne n'a pas
 * d'invitation en attente** (2026-10-10, §8.1 bis, point 4). Un lien remis
 * renouvelle l'invitation d'UNE société : sans rattachement non accepté à
 * renouveler, il n'ouvrirait rien — et le commercial croirait l'avoir fait.
 */
export class PendingInvitationNotFoundError extends ResourceNotFoundError {
  constructor(
    readonly userId: string,
    readonly companyId: string | null,
  ) {
    super(
      "account.invitation.not_found",
      "Cette personne n'a pas d'invitation en attente pour cette société. " +
        "Ouvrez-lui l'accès depuis la fiche de la société.",
    );
  }
}
