import { InvalidPhoneError } from "../errors/account-errors.js";
import { phoneMatchKey } from "../services/phone-match-key.js";
import { EmailAddress } from "./email-address.js";
import { PersonName } from "./person-name.js";
import { PhoneNumber } from "./phone-number.js";

/**
 * **La personne qu'une équipe inscrit au comptoir** : e-mail, prénom,
 * téléphone, les trois obligatoires (Hugo, 2026-11-20) — les trois champs de
 * l'invité de la boutique, sans nom de famille.
 *
 * L'adresse sort normalisée par `EmailAddress` (minuscules, sans blancs) ; le
 * téléphone est gardé tel que saisi, et sa clé de rapprochement
 * (`phoneMatchKey`) sert à reconnaître une fiche existante.
 */
export class ParticularIdentity {
  private constructor(
    readonly firstName: PersonName,
    readonly email: EmailAddress,
    readonly phone: PhoneNumber,
  ) {}

  /**
   * @throws {InvalidEmailError} l'adresse n'en est pas une.
   * @throws {InvalidPersonNameError} le prénom est vide ou trop long.
   * @throws {InvalidPhoneError} le téléphone manque ou ne ressemble pas à un numéro.
   */
  static declare(raw: {
    readonly firstName: string;
    readonly email: string;
    readonly phone: string;
  }): ParticularIdentity {
    const phone = PhoneNumber.create(raw.phone);
    // `PhoneNumber` admet le vide (un contact noté peut ne pas en avoir) : le
    // refus vit ici, où la règle est vraie.
    if (phone.isEmpty) {
      throw new InvalidPhoneError(
        raw.phone,
        "obligatoire pour inscrire un particulier au comptoir",
      );
    }
    return new ParticularIdentity(
      PersonName.create(raw.firstName, "Prénom"),
      EmailAddress.create(raw.email),
      phone,
    );
  }

  /** La clé qui reconnaît ce numéro sous une autre graphie. */
  get phoneKey(): string {
    return phoneMatchKey(this.phone.value);
  }
}
