import { InvalidCompanyIdentityError } from "../errors/account-errors.js";
import { EmailAddress } from "../value-objects/email-address.js";
import { PersonName } from "../value-objects/person-name.js";
import { PhoneNumber } from "../value-objects/phone-number.js";
import { Siret } from "../value-objects/siret.js";

const TEXT_MAX_LENGTH = 160;

/** Identité légale déclarée au formulaire « Créer une entreprise ». */
export interface CompanyIdentityInput {
  readonly raisonSociale: string;
  /** Nom commercial si différent — vide = identique à la raison sociale. */
  readonly enseigne: string;
  /** SAS, SARL, EI… */
  readonly formeJuridique: string;
  readonly siret: string;
  /** N° de TVA intracommunautaire — vide si non assujetti / inconnu. */
  readonly tvaIntracom: string;
}

/** Le contact principal de la société, repris du profil de son créateur. */
export interface CompanyContact {
  readonly firstName: PersonName;
  readonly lastName: PersonName;
  readonly email: EmailAddress;
  readonly phone: PhoneNumber;
}

/**
 * Société cliente, telle qu'un client la **déclare** depuis « Mes entreprises ».
 *
 * `declare()` porte le sens : la société sort de là **non validée**
 * (`pending` en base) et le devient par une activation commerciale explicite.
 * Il n'existe pas de fabrique qui produise directement une société active — le
 * modèle refuse ainsi le raccourci « saisie donc cliente ».
 *
 * Le contact principal n'est pas saisi au formulaire : c'est le **créateur**. La
 * personne qui déclare son entreprise en est, par construction, l'interlocuteur ;
 * lui redemander son nom et son e-mail juste après les avoir renseignés dans son
 * profil serait de la double saisie. Il reste modifiable ensuite.
 */
export class Company {
  private constructor(
    readonly raisonSociale: string,
    readonly enseigne: string,
    readonly formeJuridique: string,
    readonly siret: Siret,
    readonly tvaIntracom: string,
    readonly contact: CompanyContact,
  ) {}

  static declare(identity: CompanyIdentityInput, contact: CompanyContact): Company {
    return new Company(
      required(identity.raisonSociale, "Raison sociale"),
      optional(identity.enseigne, "Enseigne"),
      required(identity.formeJuridique, "Forme juridique"),
      Siret.create(identity.siret),
      optional(identity.tvaIntracom, "TVA intracommunautaire"),
      contact,
    );
  }

  /** Enseigne effective : le nom commercial s'il existe, la raison sociale sinon. */
  displayName(): string {
    return this.enseigne === "" ? this.raisonSociale : this.enseigne;
  }
}

/** Texte obligatoire, normalisé (espaces réduits). */
function required(raw: string, field: string): string {
  const trimmed = collapse(raw);
  if (trimmed === "") {
    throw new InvalidCompanyIdentityError(field, "obligatoire");
  }
  return capped(trimmed, field);
}

/** Texte facultatif : vide autorisé, borné sinon. */
function optional(raw: string, field: string): string {
  const trimmed = collapse(raw);
  return trimmed === "" ? "" : capped(trimmed, field);
}

function collapse(raw: string): string {
  return raw.trim().replace(/\s+/gu, " ");
}

function capped(value: string, field: string): string {
  if (value.length > TEXT_MAX_LENGTH) {
    throw new InvalidCompanyIdentityError(field, `au plus ${TEXT_MAX_LENGTH} caractères`);
  }
  return value;
}
