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
  /** Rôle/fonction dans l'entreprise — vide si non renseigné (le client le laisse vide). */
  readonly fonction: string;
  readonly email: EmailAddress;
  readonly phone: PhoneNumber;
}

/** Ce qu'il faut pour **reconstituer** une société persistée (elle porte son id). */
export interface ReconstituteCompanyInput {
  readonly id: string;
  readonly raisonSociale: string;
  readonly enseigne: string;
  readonly formeJuridique: string;
  readonly siret: string;
  readonly tvaIntracom: string;
  readonly contact: CompanyContact;
}

/** État **souple** sérialisé (les seuls champs que les éditions client mutent). */
export interface CompanySoftState {
  readonly enseigne: string;
  readonly tvaIntracom: string;
  readonly contact: {
    readonly firstName: string;
    readonly lastName: string;
    readonly fonction: string;
    readonly email: string;
    readonly phone: string;
  };
}

/**
 * Société cliente, telle qu'un client la **déclare** depuis « Mes entreprises ».
 *
 * `declare()` porte le sens : la société sort de là **non validée**
 * (`pending` en base) et le devient par une activation commerciale explicite.
 * Il n'existe pas de fabrique qui produise directement une société active — le
 * modèle refuse ainsi le raccourci « saisie donc cliente ».
 *
 * L'identité **légale** (raison sociale, forme, SIRET) est **figée** : on ne la
 * mute pas après déclaration. Seules l'**identité souple** (enseigne + TVA) et le
 * **contact principal** s'éditent — par des méthodes métier, jamais par écriture
 * de colonne. `toPersistence()` ne sérialise que ces champs mutables.
 */
export class Company {
  private constructor(
    private readonly identityId: string | null,
    readonly raisonSociale: string,
    private enseigneValue: string,
    readonly formeJuridique: string,
    readonly siret: Siret,
    private tvaIntracomValue: string,
    private contactValue: CompanyContact,
  ) {}

  static declare(identity: CompanyIdentityInput, contact: CompanyContact): Company {
    return new Company(
      null,
      required(identity.raisonSociale, "Raison sociale"),
      optional(identity.enseigne, "Enseigne"),
      required(identity.formeJuridique, "Forme juridique"),
      Siret.create(identity.siret),
      optional(identity.tvaIntracom, "TVA intracommunautaire"),
      contact,
    );
  }

  /** Reconstitue une société depuis la base (déjà valide — ses VOs revalident). */
  static reconstitute(input: ReconstituteCompanyInput): Company {
    return new Company(
      input.id,
      input.raisonSociale,
      input.enseigne,
      input.formeJuridique,
      Siret.create(input.siret),
      input.tvaIntracom,
      input.contact,
    );
  }

  get id(): string | null {
    return this.identityId;
  }

  get enseigne(): string {
    return this.enseigneValue;
  }

  get tvaIntracom(): string {
    return this.tvaIntracomValue;
  }

  get contact(): CompanyContact {
    return this.contactValue;
  }

  /** Édite l'identité **souple** (enseigne + TVA). L'identité légale reste figée. */
  editSoftIdentity(input: { enseigne: string; tvaIntracom: string }): void {
    this.enseigneValue = optional(input.enseigne, "Enseigne");
    this.tvaIntracomValue = optional(input.tvaIntracom, "TVA intracommunautaire");
  }

  /** Remplace le contact **principal** (toujours présent — jamais supprimé). */
  changePrimaryContact(contact: CompanyContact): void {
    this.contactValue = contact;
  }

  /** Enseigne effective : le nom commercial s'il existe, la raison sociale sinon. */
  displayName(): string {
    return this.enseigneValue === "" ? this.raisonSociale : this.enseigneValue;
  }

  /** Sérialise les champs **mutables** pour l'adaptateur (identité souple + contact). */
  toPersistence(): CompanySoftState {
    return {
      enseigne: this.enseigneValue,
      tvaIntracom: this.tvaIntracomValue,
      contact: {
        firstName: this.contactValue.firstName.value,
        lastName: this.contactValue.lastName.value,
        fonction: this.contactValue.fonction,
        email: this.contactValue.email.value,
        phone: this.contactValue.phone.value,
      },
    };
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
