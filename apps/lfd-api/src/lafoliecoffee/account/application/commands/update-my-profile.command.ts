import type { SignupConsent } from "../services/account-marketing-consent.js";

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
    /**
     * La case de la société cochée à l'INSCRIPTION (`/bienvenue`, plan de
     * désinscription, C2) — `null` hors de ce geste, ou sans case.
     */
    readonly signupConsent: SignupConsent | null = null,
  ) {}
}
