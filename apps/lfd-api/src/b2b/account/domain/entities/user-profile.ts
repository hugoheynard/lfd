import { EmailAddress } from "../value-objects/email-address.js";
import { PersonName } from "../value-objects/person-name.js";
import { PhoneNumber } from "../value-objects/phone-number.js";

/** Ce qu'une personne déclare de son profil, tel qu'il arrive de la frontière. */
export interface UserProfileInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
}

/**
 * Profil de la **personne** qui possède le compte — nom, prénom, e-mail,
 * téléphone.
 *
 * Distinct du contact d'une société : la même personne peut être le contact de
 * plusieurs entreprises, et une entreprise peut avoir un contact qui n'est pas
 * son créateur. Confondre les deux (l'ancien modèle) rendait impossible d'avoir
 * un compte sans entreprise.
 *
 * `create()` est le seul constructeur : un profil invalide n'existe pas en
 * mémoire, quel que soit le chemin d'entrée (HTTP, seed, import).
 */
export class UserProfile {
  private constructor(
    readonly firstName: PersonName,
    readonly lastName: PersonName,
    readonly email: EmailAddress,
    readonly phone: PhoneNumber,
  ) {}

  static create(input: UserProfileInput): UserProfile {
    return new UserProfile(
      PersonName.create(input.firstName, "Prénom"),
      PersonName.create(input.lastName, "Nom"),
      EmailAddress.create(input.email),
      PhoneNumber.create(input.phone),
    );
  }

  /**
   * Vrai si l'e-mail diffère de celui déjà enregistré.
   *
   * L'appelant s'en sert pour ne toucher au fournisseur d'identité **que** sur un
   * vrai changement : un simple renommage ne doit pas déclencher une
   * re-vérification d'adresse chez Auth0, ni échouer quand ce canal est
   * indisponible.
   */
  emailDiffersFrom(currentEmail: string): boolean {
    return !this.email.equals(EmailAddress.create(currentEmail));
  }

  /** Nom d'usage — « Prénom Nom ». */
  fullName(): string {
    return `${this.firstName.value} ${this.lastName.value}`;
  }
}
