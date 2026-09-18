/**
 * **Le retrait scanné** — le QR du client, lu par une session staff.
 *
 * L'auteur staff est la fiche résolue par `StaffAccessGuard` à partir du jeton
 * d'accès, jamais le corps de la requête : c'est lui qui fait du scan une
 * preuve.
 */
export class ConfirmHandoverCommand {
  constructor(
    readonly token: string,
    readonly staffUserId: string,
  ) {}
}
