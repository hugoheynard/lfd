/**
 * **La remise scannée** — le QR du client, lu par une session staff.
 *
 * Le sujet staff vient du jeton d'accès, jamais du corps de la requête : c'est
 * lui qui fait du scan une preuve.
 */
export class ConfirmHandoverCommand {
  constructor(
    readonly token: string,
    readonly staffSubject: string,
  ) {}
}
