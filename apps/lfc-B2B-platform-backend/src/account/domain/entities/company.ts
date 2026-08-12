import {
  CompanyActivationBlockedError,
  CompanyStatusTransitionError,
  InvalidCompanyIdentityError,
} from "../errors/account-errors.js";
import { NO_FULFILLMENT_PREFERENCE } from "@lfd/contracts";
import type { DeferredTerm, FulfillmentPreferenceView } from "@lfd/contracts";
import type { CompanyStatus } from "../value-objects/company-status.js";
import type { StaffTrace } from "../value-objects/staff-trace.js";
import type { SuspensionCause } from "../value-objects/suspension-cause.js";
import { EmailAddress } from "../value-objects/email-address.js";
import { PersonName } from "../value-objects/person-name.js";
import { PhoneNumber } from "../value-objects/phone-number.js";
import { Siret } from "../value-objects/siret.js";

const TEXT_MAX_LENGTH = 160;

/** Identité légale déclarée au formulaire « Créer une entreprise ». */
export interface CompanyIdentityInput {
  readonly raisonSociale: string;
  /** Le nom d'usage — c'est LUI qu'on exige, pas la raison sociale. */
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
  readonly grantedTerms: readonly DeferredTerm[];
  /** Terme **demandé** par le client, ou `null` (aucune demande en cours). */
  readonly requestedTerm: DeferredTerm | null;
  readonly status: CompanyStatus;
  /** Horodatage d'activation commerciale, ou `null` (jamais activée). */
  readonly activatedAt: Date | null;
  /** Qui a activé, à quel titre — `null` pour les activations antérieures à la trace. */
  readonly activatedBy: StaffTrace | null;
  /** Ce qui a coupé l'accès — `null` hors suspension (cf. {@link SuspensionCause}). */
  readonly suspensionCause: SuspensionCause | null;
  /** Code NAF résolu depuis le SIRET, ou vide si pas encore connu. */
  readonly nafCode: string;
  /**
   * Préférence d'acheminement, **facultative** : une société lue sans elle n'en
   * a simplement pas — ce qui est l'état de tout le portefeuille existant.
   */
  readonly fulfillmentPreference?: FulfillmentPreferenceView;
}

/**
 * État sérialisé pour l'adaptateur : identité souple + contact + termes de
 * règlement + statut/activation. Le **KBIS** garde son écriture propre (couplée
 * au stockage objet R2), hors de cet agrégat.
 */
export interface CompanySoftState {
  readonly enseigne: string;
  /**
   * L'identité légale figure ici **parce qu'elle peut désormais être complétée**
   * après coup : un compte s'ouvre sans papiers, et ils arrivent ensuite. Elle
   * n'est pour autant pas « souple » — l'agrégat refuse de la réécrire une fois
   * posée (cf. `completeLegalIdentity`).
   */
  readonly raisonSociale: string;
  readonly formeJuridique: string;
  readonly siret: string;
  readonly tvaIntracom: string;
  readonly contact: {
    readonly firstName: string;
    readonly lastName: string;
    readonly fonction: string;
    readonly email: string;
    readonly phone: string;
  };
  readonly grantedTerms: readonly DeferredTerm[];
  readonly requestedTerm: DeferredTerm | null;
  readonly status: CompanyStatus;
  readonly activatedAt: Date | null;
  readonly activatedBy: StaffTrace | null;
  readonly suspensionCause: SuspensionCause | null;
  /** Code NAF résolu depuis le SIRET, ou vide si pas encore connu. */
  readonly nafCode: string;
  /** Comment ce client est servi d'habitude — un défaut, jamais une contrainte. */
  readonly fulfillmentPreference: FulfillmentPreferenceView;
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
 * (`changePrimaryContact`), crédits de règlement (`requestTerm` / `grantTerms`),
 * activation (`activate`). `toPersistence()` sérialise ces
 * champs mutables ; le KBIS garde son écriture propre (couplée au stockage).
 */
export class Company {
  private constructor(
    private readonly identityId: string | null,
    private raisonSocialeValue: string,
    private enseigneValue: string,
    private formeJuridiqueValue: string,
    private siretValue: Siret | null,
    private tvaIntracomValue: string,
    private contactValue: CompanyContact,
    private grantedTermsValue: readonly DeferredTerm[],
    private requestedTermValue: DeferredTerm | null,
    private preferenceValue: FulfillmentPreferenceView,
    private statusValue: CompanyStatus,
    private activatedAtValue: Date | null,
    private activatedByValue: StaffTrace | null,
    private suspensionCauseValue: SuspensionCause | null,
    /** Code NAF résolu depuis le SIRET (via l'API entreprises) — vide tant qu'inconnu. */
    private nafCodeValue: string,
  ) {}

  static declare(identity: CompanyIdentityInput, contact: CompanyContact): Company {
    return new Company(
      null,
      // L'ENSEIGNE est ce qu'on exige : c'est le nom que le commercial a en
      // tête et que le client donne au téléphone. La raison sociale est une
      // donnée de greffe — elle arrive avec le SIRET, pas avant.
      optional(identity.raisonSociale, "Raison sociale"),
      required(identity.enseigne, "Enseigne"),
      // Forme juridique et SIRET sont FACULTATIFS à l'ouverture : le compte se
      // crée souvent chez le client, qui n'a pas ses papiers sous la main. Ils
      // se complètent ensuite, et l'activation les exige (cf. `activate`).
      optional(identity.formeJuridique, "Forme juridique"),
      Siret.createOptional(identity.siret),
      optional(identity.tvaIntracom, "TVA intracommunautaire"),
      contact,
      // Déclarée : aucun crédit accordé (elle paie à la commande), aucune demande,
      // aucune préférence d'acheminement, et **non validée** (pending) —
      // l'activation est commerciale, jamais implicite.
      [],
      null,
      NO_FULFILLMENT_PREFERENCE,
      "pending",
      null,
      null,
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
      Siret.createOptional(input.siret),
      input.tvaIntracom,
      input.contact,
      input.grantedTerms,
      input.requestedTerm,
      input.fulfillmentPreference ?? NO_FULFILLMENT_PREFERENCE,
      input.status,
      input.activatedAt,
      input.activatedBy,
      input.suspensionCause,
      input.nafCode,
    );
  }

  get id(): string | null {
    return this.identityId;
  }

  get raisonSociale(): string {
    return this.raisonSocialeValue;
  }

  get enseigne(): string {
    return this.enseigneValue;
  }

  get formeJuridique(): string {
    return this.formeJuridiqueValue;
  }

  /** Le SIRET, ou `null` tant qu'on ne l'a pas. */
  get siret(): Siret | null {
    return this.siretValue;
  }

  /** Les 14 chiffres, ou la chaîne vide — la forme que la persistance attend. */
  get siretDigits(): string {
    return this.siretValue?.value ?? "";
  }

  /** Vrai quand forme juridique **et** SIRET sont là : de quoi facturer. */
  get hasLegalIdentity(): boolean {
    return (
      this.raisonSocialeValue !== "" && this.formeJuridiqueValue !== "" && this.siretValue !== null
    );
  }

  /**
   * **Complète** l'identité légale laissée en suspens à l'ouverture.
   *
   * On comble un trou, on ne réécrit pas : un champ déjà renseigné est ignoré,
   * silencieusement. Le SIRET identifie un établissement — le changer ferait
   * d'une société une autre, sous la même référence client, avec son historique
   * de commandes. Corriger une faute de frappe est une opération à part, qui
   * devra s'assumer comme telle.
   */
  completeLegalIdentity(input: {
    raisonSociale: string;
    formeJuridique: string;
    siret: string;
  }): void {
    if (this.raisonSocialeValue === "") {
      this.raisonSocialeValue = optional(input.raisonSociale, "Raison sociale");
    }
    if (this.formeJuridiqueValue === "") {
      this.formeJuridiqueValue = optional(input.formeJuridique, "Forme juridique");
    }
    if (this.siretValue === null) {
      this.siretValue = Siret.createOptional(input.siret);
    }
  }

  /**
   * **Corrige** l'identité légale — l'opération que `completeLegalIdentity`
   * annonçait sans la fournir.
   *
   * Elle réécrit, y compris le SIRET, et c'est assumé : une faute de frappe
   * saisie au comptoir restait gravée, et le compte portait une identité fausse
   * pour toujours. Ce que le commentaire d'à côté protège — « changer le SIRET
   * fait d'une société une autre » — reste vrai ; c'est pourquoi ceci n'est PAS
   * offert au client sur sa propre société, seulement au back-office, où
   * l'on sait ce qu'on répare et où le geste laisse une trace.
   *
   * Un champ **vide** ne réécrit rien : corriger la forme juridique ne doit pas
   * effacer un SIRET qu'on n'a pas retapé.
   */
  correctLegalIdentity(input: {
    raisonSociale: string;
    formeJuridique: string;
    siret: string;
  }): void {
    if (input.raisonSociale.trim() !== "") {
      this.raisonSocialeValue = optional(input.raisonSociale, "Raison sociale");
    }
    if (input.formeJuridique.trim() !== "") {
      this.formeJuridiqueValue = optional(input.formeJuridique, "Forme juridique");
    }
    if (input.siret.trim() !== "") {
      this.siretValue = Siret.createOptional(input.siret);
    }
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

  /** Les crédits accordés — vide veut dire « paie à la commande », comme tout le monde. */
  get grantedTerms(): readonly DeferredTerm[] {
    return this.grantedTermsValue;
  }

  get requestedTerm(): DeferredTerm | null {
    return this.requestedTermValue;
  }

  /**
   * Cette société règle-t-elle **au compte** ?
   *
   * Dès qu'un crédit est accordé, c'est le régime négocié, donc le défaut. Le
   * client garde la possibilité de payer une commande ponctuelle par carte —
   * mais c'est lui qui le demande, commande par commande.
   */
  settlesOnAccount(): boolean {
    return this.grantedTermsValue.length > 0;
  }

  /**
   * Le client **demande** un crédit (il ne se l'accorde jamais lui-même).
   * Demander un terme **déjà accordé** revient à retirer la demande : il n'y a
   * alors rien « en attente » à afficher.
   */
  requestTerm(term: DeferredTerm | null): void {
    const alreadyGranted = term !== null && this.grantedTermsValue.includes(term);
    this.requestedTermValue = alreadyGranted ? null : term;
  }

  /**
   * Le **staff** accorde l'ensemble des crédits (Porte B) et **solde** la
   * demande en cours — il a tranché, il n'y a plus rien en attente.
   *
   * On reçoit l'ensemble complet plutôt qu'un ajout : l'écran montre des
   * interrupteurs, et deux clics rapides ne doivent pas laisser la fiche et la
   * base en désaccord. Les doublons sont écartés — accorder deux fois le même
   * crédit n'a pas de sens.
   */
  grantTerms(terms: readonly DeferredTerm[]): void {
    this.grantedTermsValue = [...new Set(terms)];
    this.requestedTermValue = null;
  }

  /** Comment ce client est servi d'habitude. */
  get fulfillmentPreference(): FulfillmentPreferenceView {
    return this.preferenceValue;
  }

  /**
   * Pose la **préférence d'acheminement** — un point de départ pour la commande,
   * pas une contrainte : le client peut toujours en changer au panier.
   *
   * L'invariant tenu ici : le pointeur qui ne concerne pas la méthode choisie est
   * **effacé**. Garder l'adresse de livraison d'un client passé au retrait la
   * ferait ressurgir des mois plus tard, au moment où quelqu'un rebasculerait la
   * méthode — avec une adresse que plus personne n'a validée entre-temps.
   *
   * Les deux pointeurs restent facultatifs : `null` veut dire « le défaut du
   * moment », et c'est plus juste que de figer l'adresse par défaut actuelle.
   */
  preferFulfillment(preference: FulfillmentPreferenceView): void {
    this.preferenceValue = {
      method: preference.method,
      pickupAddressId: preference.method === "pickup" ? preference.pickupAddressId : null,
      deliveryAddressId: preference.method === "delivery" ? preference.deliveryAddressId : null,
    };
  }

  get status(): CompanyStatus {
    return this.statusValue;
  }

  /** Ce qui a coupé l'accès — `null` hors suspension. */
  get suspensionCause(): SuspensionCause | null {
    return this.suspensionCauseValue;
  }

  /**
   * **Active** la société (activation commerciale explicite) : `pending → active`
   * + pose l'horodatage. Ne porte QUE la transition d'état ; la **complétude des
   * pièces** (TVA/KBIS/adresses, selon les settings) est une policy vérifiée en
   * amont par le cas d'usage — elle croise plusieurs tables, hors de cet agrégat.
   * Refuse toute société qui n'est pas `pending` (déjà active, suspendue, close).
   */
  activate(activatedAt: Date, reachable: boolean, by: StaffTrace): void {
    // **Un numéro pour la livraison.** Le livreur qui cherche une porte a besoin
    // d'appeler quelqu'un ; un compte actif sans aucun numéro joignable, c'est
    // une commande qui repart au dépôt. « Au moins un interlocuteur », et pas
    // « le détenteur » : c'est souvent le responsable réception qui a le numéro
    // utile, et exiger celui du gérant bloquerait un dossier complet par
    // ailleurs.
    if (!reachable) {
      throw new CompanyActivationBlockedError(
        this.identityId ?? "",
        ["telephone"],
        "Aucun numéro de téléphone : un livreur doit pouvoir joindre quelqu'un.",
      );
    }
    // L'identité légale, elle, EST de cet agrégat — et sans elle on ne peut pas
    // facturer. Un compte s'ouvre sans papiers ; il ne devient pas client sans.
    if (!this.hasLegalIdentity) {
      throw new CompanyActivationBlockedError(
        this.identityId ?? "",
        ["identite_legale"],
        "Raison sociale, forme juridique et SIRET sont nécessaires pour activer un compte.",
      );
    }
    if (this.statusValue !== "pending") {
      throw new CompanyActivationBlockedError(
        this.identityId ?? "",
        [],
        "Seul un compte en attente peut être activé.",
      );
    }
    this.statusValue = "active";
    this.activatedAtValue = activatedAt;
    this.activatedByValue = by;
  }

  /**
   * **Suspend** le compte : il existe encore, il n'achète plus. Seul un compte
   * `active` se suspend — suspendre ce qui n'a jamais été ouvert ne veut rien
   * dire, et suspendre un compte résilié le rouvrirait à moitié.
   */
  suspend(cause: SuspensionCause): void {
    this.requireStatus("active", "Seul un compte actif peut être suspendu.");
    this.statusValue = "suspended";
    this.suspensionCauseValue = cause;
  }

  /**
   * **Réactive** un compte suspendu. Rien d'autre ne se réactive — et la cause
   * tombe avec la suspension : un compte actif ne traîne pas le motif de la
   * dernière coupure, sans quoi la prochaine reprise automatique s'appuierait sur
   * une raison périmée.
   */
  reactivate(): void {
    this.requireStatus("suspended", "Seul un compte suspendu peut être réactivé.");
    this.statusValue = "active";
    this.suspensionCauseValue = null;
  }

  /**
   * **Résilie** le compte — état **terminal**. Ni un compte déjà résilié ni un
   * compte jamais activé ne s'y prêtent : on ne clôt que ce qui a été ouvert, et
   * une résiliation ne se défait pas. Reprendre la relation, c'est rouvrir un
   * compte, pas ressusciter celui-là.
   */
  terminate(): void {
    if (this.statusValue !== "active" && this.statusValue !== "suspended") {
      throw new CompanyStatusTransitionError(this.identityId ?? "", this.statusValue, "terminated");
    }
    this.statusValue = "terminated";
  }

  private requireStatus(expected: CompanyStatus, message: string): void {
    if (this.statusValue !== expected) {
      throw new CompanyStatusTransitionError(this.identityId ?? "", this.statusValue, message);
    }
  }

  /**
   * Le nom sous lequel elle se reconnaît : l'enseigne, à défaut la raison
   * sociale. C'est ce qu'affichent les écrans — la raison sociale, elle, ne sert
   * qu'aux documents légaux.
   */
  displayName(): string {
    return this.enseigneValue === "" ? this.raisonSocialeValue : this.enseigneValue;
  }

  /** Sérialise les champs **mutables** pour l'adaptateur (identité souple + contact + termes). */
  toPersistence(): CompanySoftState {
    return {
      enseigne: this.enseigneValue,
      raisonSociale: this.raisonSocialeValue,
      formeJuridique: this.formeJuridiqueValue,
      siret: this.siretDigits,
      tvaIntracom: this.tvaIntracomValue,
      contact: {
        firstName: this.contactValue.firstName.value,
        lastName: this.contactValue.lastName.value,
        fonction: this.contactValue.fonction,
        email: this.contactValue.email.value,
        phone: this.contactValue.phone.value,
      },
      grantedTerms: this.grantedTermsValue,
      requestedTerm: this.requestedTermValue,
      fulfillmentPreference: this.preferenceValue,
      status: this.statusValue,
      activatedAt: this.activatedAtValue,
      activatedBy: this.activatedByValue,
      suspensionCause: this.suspensionCauseValue,
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
