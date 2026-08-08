import {
  CompanyActivationBlockedError,
  InvalidCompanyIdentityError,
} from "../errors/account-errors.js";
import type { PaymentTerm } from "../ports/account.reader.js";
import type { CompanyStatus } from "../value-objects/company-status.js";
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
  /** Terme **convenu** (celui qui s'applique). */
  readonly paymentTerm: PaymentTerm;
  /** Terme **demandé** par le client, ou `null` (aucune demande en cours). */
  readonly requestedPaymentTerm: PaymentTerm | null;
  readonly status: CompanyStatus;
  /** Horodatage d'activation commerciale, ou `null` (jamais activée). */
  readonly activatedAt: Date | null;
  /** Code NAF résolu depuis le SIRET, ou vide si pas encore connu. */
  readonly nafCode: string;
}

/**
 * État sérialisé pour l'adaptateur : identité souple + contact + termes de
 * règlement + statut/activation. Le **KBIS** garde son écriture propre (couplée
 * au stockage objet R2), hors de cet agrégat.
 */
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
  readonly paymentTerm: PaymentTerm;
  readonly requestedPaymentTerm: PaymentTerm | null;
  readonly status: CompanyStatus;
  readonly activatedAt: Date | null;
  /** Code NAF résolu depuis le SIRET, ou vide si pas encore connu. */
  readonly nafCode: string;
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
 * mute pas après déclaration. Ce qui évolue le fait par des **méthodes métier**,
 * jamais par écriture de colonne : identité souple (`editSoftIdentity`), contact
 * (`changePrimaryContact`), termes de règlement (`requestPaymentTerm` /
 * `agreePaymentTerm`), activation (`activate`). `toPersistence()` sérialise ces
 * champs mutables ; le KBIS garde son écriture propre (couplée au stockage).
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
    private paymentTermValue: PaymentTerm,
    private requestedPaymentTermValue: PaymentTerm | null,
    private statusValue: CompanyStatus,
    private activatedAtValue: Date | null,
    /** Code NAF résolu depuis le SIRET (via l'API entreprises) — vide tant qu'inconnu. */
    private nafCodeValue: string,
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
      // Déclarée : règlement à la commande par défaut, aucune demande en cours,
      // et **non validée** (pending) — l'activation est commerciale, jamais implicite.
      "per_order",
      null,
      "pending",
      null,
      // NAF inconnu à la déclaration : résolu peu après depuis le SIRET (best-effort).
      "",
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
      input.paymentTerm,
      input.requestedPaymentTerm,
      input.status,
      input.activatedAt,
      input.nafCode,
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

  get nafCode(): string {
    return this.nafCodeValue;
  }

  /**
   * Attribue le code NAF **résolu depuis le SIRET** (via l'API entreprises).
   * Attribution technique, pas une saisie utilisateur : vide = « on ne sait pas »
   * (on n'écrase pas une valeur connue par un échec de résolution — géré en amont).
   */
  assignNaf(naf: string): void {
    this.nafCodeValue = optional(naf, "Code NAF");
  }

  /** Remplace le contact **principal** (toujours présent — jamais supprimé). */
  changePrimaryContact(contact: CompanyContact): void {
    this.contactValue = contact;
  }

  get paymentTerm(): PaymentTerm {
    return this.paymentTermValue;
  }

  get requestedPaymentTerm(): PaymentTerm | null {
    return this.requestedPaymentTermValue;
  }

  /**
   * Le client **demande** un terme de règlement (il ne le convient jamais lui-même).
   * Demander le terme **déjà convenu** revient à retirer la demande (`null`) : il
   * n'y a alors rien « en attente » à afficher. `null` retire aussi la demande.
   */
  requestPaymentTerm(term: PaymentTerm | null): void {
    this.requestedPaymentTermValue = term === this.paymentTermValue ? null : term;
  }

  /**
   * Le **staff** convient un terme (Porte B) : il devient le terme appliqué **et**
   * **solde** la demande en cours (`requestedPaymentTerm` → `null`) — le commercial
   * a tranché, il n'y a plus rien en attente.
   */
  agreePaymentTerm(term: PaymentTerm): void {
    this.paymentTermValue = term;
    this.requestedPaymentTermValue = null;
  }

  get status(): CompanyStatus {
    return this.statusValue;
  }

  /**
   * **Active** la société (activation commerciale explicite) : `pending → active`
   * + pose l'horodatage. Ne porte QUE la transition d'état ; la **complétude des
   * pièces** (TVA/KBIS/adresses, selon les settings) est une policy vérifiée en
   * amont par le cas d'usage — elle croise plusieurs tables, hors de cet agrégat.
   * Refuse toute société qui n'est pas `pending` (déjà active, suspendue, close).
   */
  activate(activatedAt: Date): void {
    if (this.statusValue !== "pending") {
      throw new CompanyActivationBlockedError(
        this.identityId ?? "",
        [],
        "Seul un compte en attente peut être activé.",
      );
    }
    this.statusValue = "active";
    this.activatedAtValue = activatedAt;
  }

  /** Enseigne effective : le nom commercial s'il existe, la raison sociale sinon. */
  displayName(): string {
    return this.enseigneValue === "" ? this.raisonSociale : this.enseigneValue;
  }

  /** Sérialise les champs **mutables** pour l'adaptateur (identité souple + contact + termes). */
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
      paymentTerm: this.paymentTermValue,
      requestedPaymentTerm: this.requestedPaymentTermValue,
      status: this.statusValue,
      activatedAt: this.activatedAtValue,
      nafCode: this.nafCodeValue,
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
