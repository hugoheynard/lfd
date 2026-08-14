/** Un membre de l'équipe invité qui n'a **jamais posé de mot de passe**. */
export interface PendingStaffAccessView {
  readonly staffUserId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  /** Sa fonction, ou vide — le pendant de la société côté client. */
  readonly jobTitle: string;
  /** ISO. Depuis quand l'invitation est partie. */
  readonly invitedAt: string;
}

/**
 * La **file des accès staff à remettre**, jumelle de celle des clients.
 *
 * Deux files et non une liste fusionnée : ce sont deux annuaires (`staff_users`
 * est le référentiel local de l'équipe, les clients vivent dans `users`) et
 * surtout **deux murs** — celle-ci exige `staff:write`, l'autre
 * `companies:read`. Les réunir obligerait à filtrer par droit à l'intérieur
 * d'une même liste, et c'est le genre de mur qui finit par fuir.
 *
 * Même invariant, en revanche : rien n'est stocké. La file est une requête sur
 * le statut `invited`, et une personne en sort d'elle-même dès qu'elle a posé
 * son mot de passe.
 */
export abstract class PendingStaffAccessReader {
  abstract list(): Promise<readonly PendingStaffAccessView[]>;
  /** Le sujet d'identité d'un invité, ou `null` s'il n'attend plus. */
  abstract subjectOf(staffUserId: string): Promise<string | null>;
}
