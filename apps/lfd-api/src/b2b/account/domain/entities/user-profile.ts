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
 * `revise()` est le seul constructeur : un profil invalide n'existe pas en
 * mémoire, quel que soit le chemin d'entrée (HTTP, seed, import).
 *
 * **La preuve d'adresse suit l'adresse** (2026-09-14). Un profil se construit
 * TOUJOURS contre l'adresse enregistrée, et sait donc s'il la remplace
 * ({@link emailChanged}). La persistance en tire la remise à `false` de la
 * vérification, dans la même écriture que la nouvelle adresse. Il n'existe plus
 * de fabrique qui ignore l'adresse d'avant : c'est ce qui laissait une personne
 * vérifiée le rester quelle que soit l'adresse tapée ensuite.
 */
export class UserProfile {
  private constructor(
    readonly firstName: PersonName,
    readonly lastName: PersonName,
    readonly email: EmailAddress,
    readonly phone: PhoneNumber,
    /** Vrai si ce profil remplace l'adresse enregistrée par une autre. */
    readonly emailChanged: boolean,
  ) {}

  /**
   * Le profil tel que la personne le déclare, confronté à l'adresse
   * **actuellement enregistrée**.
   *
   * @throws {InvalidEmailError} si l'adresse enregistrée elle-même n'en est pas
   *   une : on ne décide pas qu'une adresse « change » en la comparant à rien.
   */
  static revise(currentEmail: string, input: UserProfileInput): UserProfile {
    const email = EmailAddress.create(input.email);
    return new UserProfile(
      PersonName.create(input.firstName, "Prénom"),
      PersonName.create(input.lastName, "Nom"),
      email,
      PhoneNumber.create(input.phone),
      !email.equals(EmailAddress.create(currentEmail)),
    );
  }

  /** Nom d'usage — « Prénom Nom ». */
  fullName(): string {
    return `${this.firstName.value} ${this.lastName.value}`;
  }
}
