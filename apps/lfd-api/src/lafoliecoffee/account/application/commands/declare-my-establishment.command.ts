import type { SignupConsent } from "../services/account-marketing-consent.js";

/**
 * La porte pro : la personne connectée pose son profil et déclare son
 * établissement, d'un même geste.
 *
 * **Pas d'e-mail** dans la commande : le profil garde l'adresse du compte, et
 * la changer passe par `UpdateMyProfileCommand`, donc par Auth0. L'accepter ici
 * ouvrirait un second chemin de changement d'adresse, sans propagation.
 */
export class DeclareMyEstablishmentCommand {
  constructor(
    readonly userId: string,
    readonly firstName: string,
    readonly lastName: string,
    readonly phone: string,
    readonly enseigne: string,
    /** La case de la société cochée à l'inscription pro (C2) ; `null` sans case. */
    readonly signupConsent: SignupConsent | null = null,
  ) {}
}
