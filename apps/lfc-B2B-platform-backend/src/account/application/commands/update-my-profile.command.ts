/**
 * Met à jour le profil de la personne connectée.
 *
 * `subject` accompagne `userId` parce que le changement d'e-mail doit être
 * propagé au fournisseur d'identité, qui ne connaît que le `sub`.
 */
export class UpdateMyProfileCommand {
  constructor(
    readonly userId: string,
    readonly subject: string,
    readonly firstName: string,
    readonly lastName: string,
    readonly email: string,
    readonly phone: string,
  ) {}
}
