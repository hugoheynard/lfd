import { InvalidCompanyIdentityError } from "../errors/account-errors.js";
import { EmailAddress } from "./email-address.js";
import { PersonName } from "./person-name.js";
import { PhoneNumber } from "./phone-number.js";

const FONCTION_MAX_LENGTH = 80;

/** Ce qu'un formulaire de contact fournit, tel qu'il arrive de la frontière. */
export interface ContactDetailsInput {
  readonly firstName: string;
  readonly lastName: string;
  /** Rôle/fonction dans l'entreprise — facultatif. */
  readonly fonction: string;
  readonly email: string;
  readonly phone: string;
}

/**
 * Coordonnées d'un interlocuteur d'une entreprise.
 *
 * **Un seul** value object pour les deux emplois : le contact **principal**
 * (aplati sur `Company`, la carte « Admin du compte entreprise ») et les contacts
 * **additionnels** (`CompanyContact`). Les mêmes règles s'appliquent aux deux —
 * les dupliquer les ferait diverger.
 *
 * `create()` est le seul constructeur : un contact invalide n'existe pas en
 * mémoire, quel que soit le chemin d'entrée.
 */
export class ContactDetails {
  private constructor(
    readonly firstName: PersonName,
    readonly lastName: PersonName,
    readonly fonction: string,
    readonly email: EmailAddress,
    readonly phone: PhoneNumber,
  ) {}

  static create(input: ContactDetailsInput): ContactDetails {
    return new ContactDetails(
      // Prénom et nom sont FACULTATIFS : ce qui identifie un interlocuteur,
      // c'est son adresse — c'est par elle qu'on le joint et qu'il reçoit son
      // accès. Les exiger bloquerait une saisie faite au comptoir pour une
      // donnée de confort, qui se complète en deux clics plus tard.
      PersonName.optional(input.firstName, "Prénom"),
      PersonName.optional(input.lastName, "Nom"),
      fonction(input.fonction),
      EmailAddress.create(input.email),
      PhoneNumber.create(input.phone),
    );
  }
}

/** Fonction facultative : vide autorisé, bornée sinon. */
function fonction(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/gu, " ");
  if (trimmed.length > FONCTION_MAX_LENGTH) {
    throw new InvalidCompanyIdentityError("Fonction", `au plus ${FONCTION_MAX_LENGTH} caractères`);
  }
  return trimmed;
}
