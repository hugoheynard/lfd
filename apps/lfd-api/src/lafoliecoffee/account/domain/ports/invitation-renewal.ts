/**
 * **Renouveler l'invitation d'UN rattachement** (2026-10-10,
 * `architecture-compte-client-cycle-de-vie.md` §8.1 bis, point 4).
 *
 * Un lien neuf remis par le commercial repose `invited_at` du rattachement de
 * la société pour laquelle il le remet — pas des autres : une personne invitée
 * par A et par B qui reçoit un lien pour B n'a pas, par ce geste, rouvert A.
 *
 * Un port à part du dépôt des accès (ISP) : son seul consommateur est la
 * remise d'un lien, qui n'a rien à faire du reste.
 */
export abstract class InvitationRenewal {
  /**
   * Repose la date d'invitation du rattachement **non accepté** de cette
   * personne à cette société ; sans société désignée, celui dont l'invitation
   * est la plus récente — celui que la file des accès en attente affiche.
   *
   * @returns la société renouvelée, ou `null` s'il n'y a rien à renouveler.
   */
  abstract renew(userId: string, companyId: string | null, at: Date): Promise<string | null>;
}
