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
  ) {}
}
