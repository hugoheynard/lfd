/**
 * **Le retrait scanné** — le QR du client, lu par une session staff.
 *
 * L'auteur staff est la fiche résolue par `StaffAccessGuard` à partir du jeton
 * d'accès, jamais le corps de la requête : c'est lui qui fait du scan une
 * preuve.
 *
 * `ranks` : les envois cochés au comptoir (plan E7 reliquat, choix 13, L4c),
 * ou `null` — l'envoi que l'écran montrait, comme avant.
 */
export class ConfirmHandoverCommand {
  constructor(
    readonly token: string,
    readonly staffUserId: string,
    readonly ranks: readonly number[] | null = null,
  ) {}
}
