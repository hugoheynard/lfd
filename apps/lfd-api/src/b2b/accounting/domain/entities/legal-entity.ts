import type { CreditorSnapshot } from "../creditor-snapshot.js";
import {
  CreditorIdentityIsFrozenError,
  CreditorIdentifierIsImmutableError,
  EntityCannotCollectError,
  InvalidLegalEntityError,
} from "../errors/accounting-errors.js";
import { MandateDefaults, type MandatePaymentType } from "../value-objects/mandate-defaults.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import { CreditorIdentifier } from "../value-objects/creditor-identifier.js";
import { Bic } from "../value-objects/bic.js";
import { CreditorAccount } from "../value-objects/creditor-account.js";
import { Iban } from "../value-objects/iban.js";
import { LegalAddress } from "../value-objects/legal-address.js";
import { Siren } from "../value-objects/siren.js";

/**
 * Le délai EPC par défaut entre la pré-notification et le débit. Il se réduit
 * **par contrat** avec la banque, et c'est ce qui rend un cycle mensuel tenable.
 */
export const PRE_NOTIFICATION_DEFAULT_DAYS = 14;
export const PRE_NOTIFICATION_MIN_DAYS = 1;
export const PRE_NOTIFICATION_MAX_DAYS = 60;

/** L'identité déclarée à la création. Les coordonnées bancaires viennent après. */
export interface LegalEntityDeclaration {
  readonly id: string;
  readonly name: string;
  readonly legalForm: string;
  readonly siren: Siren;
  readonly address: LegalAddress;
  readonly rcs: string;
  readonly shareCapitalCents: number;
  readonly vatNumber: string;
}

/** L'état complet, tel qu'il vit en base. Aucun type Prisma ici. */
export interface LegalEntitySnapshot {
  readonly id: string;
  readonly name: string;
  readonly legalForm: string;
  readonly siren: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly postalCode: string;
  readonly city: string;
  readonly countryCode: string;
  readonly rcs: string;
  readonly shareCapitalCents: number;
  readonly vatNumber: string;
  readonly ics: string | null;
  readonly creditorIban: string | null;
  /** Le BIC de la banque du compte ci-dessus. Public, contrairement à l'IBAN. */
  readonly creditorBic: string | null;
  /**
   * Le bloc recopié du RIB : titulaire et adresse **tels que la banque les
   * connaît**. Distincts de la raison sociale et du siège ci-dessus — voir
   * {@link CreditorAccount}. Tous nuls tant qu'aucun compte n'est saisi.
   */
  readonly creditorAccountHolder: string | null;
  readonly creditorAccountLine1: string | null;
  readonly creditorAccountLine2: string | null;
  readonly creditorAccountPostalCode: string | null;
  readonly creditorAccountCity: string | null;
  readonly creditorAccountCountryCode: string | null;
  /**
   * Quand le PREMIER mandat a été frappé sous cette entité, ou `null`.
   *
   * Posé par un abonné au fait publié par `payments` — `accounting` ne lit pas
   * ses tables. Tant qu'il est nul, le créancier imprimé se corrige librement ;
   * après, il est gelé (cf. {@link LegalEntity.setCreditorAccount}).
   */
  readonly firstMandateIssuedAt: Date | null;
  readonly preNotificationDays: number;
  readonly mandateContractDescription: string;
  readonly mandatePaymentType: MandatePaymentType;
  /** Le schéma des mandats frappés DÉSORMAIS — chaque mandat fige le sien. */
  readonly mandateScheme: SepaScheme;
  /**
   * La clé de l'objet de stockage qui porte le logo, ou `null`. 🔴 Elle ne sort
   * d'aucune API — une clé qui sort finit par être acceptée en entrée.
   */
  readonly logoKey: string | null;
  readonly archivedAt: Date | null;
}

/**
 * Une **entité juridique émettrice** : qui encaisse, et sous quelle identité.
 *
 * Ce n'est pas un client — c'est nous. Le mot `Company` est déjà pris par le
 * client professionnel dans tout le bloc `b2b`, et confondre les deux ferait
 * d'un contexte entier un piège de vocabulaire.
 *
 * Ce que l'agrégat garde, et qu'un CRUD perdrait, ce sont **deux règles de
 * durée** que rien d'autre ne peut tenir :
 *
 * - **l'ICS ne se remplace pas.** Il est imprimé sur chaque mandat signé ; le
 *   changer ici ferait prélever sous un identifiant que personne n'a autorisé ;
 * - **encaisser demande un ICS ET un compte.** Un émetteur à moitié renseigné
 *   n'est pas une entité incomplète qu'on rattrapera à l'écran, c'est un lot de
 *   prélèvement qui part faux. `creditorSnapshot()` refuse plutôt que de rendre
 *   des chaînes vides qu'un gabarit imprimerait sans broncher.
 *
 * Tout le reste — raison sociale, adresse, capital — **change librement**, et
 * c'est pour ça que les documents en prennent une copie (cf.
 * {@link CreditorSnapshot}).
 */
export class LegalEntity {
  private constructor(
    readonly id: string,
    private nameValue: string,
    private legalFormValue: string,
    readonly siren: Siren,
    private addressValue: LegalAddress,
    private rcsValue: string,
    private shareCapitalCentsValue: number,
    private vatNumberValue: string,
    private icsValue: CreditorIdentifier | null,
    private creditorAccountValue: CreditorAccount | null,
    private firstMandateIssuedAtValue: Date | null,
    private preNotificationDaysValue: number,
    private mandateDefaultsValue: MandateDefaults,
    private mandateSchemeValue: SepaScheme,
    private logoKeyValue: string | null,
    private archivedAtValue: Date | null,
  ) {}

  /**
   * Déclare une entité — sans coordonnées bancaires : l'ICS arrive de la Banque
   * de France des semaines après qu'on a saisi la raison sociale, et exiger les
   * deux d'un coup interdirait de préparer le dossier en attendant.
   */
  static declare(declaration: LegalEntityDeclaration): LegalEntity {
    return new LegalEntity(
      requireText(declaration.id, "Identifiant"),
      requireText(declaration.name, "Raison sociale"),
      requireText(declaration.legalForm, "Forme juridique"),
      declaration.siren,
      declaration.address,
      declaration.rcs.trim(),
      requireCapital(declaration.shareCapitalCents),
      declaration.vatNumber.trim().toUpperCase(),
      // ICS et compte créancier : absents à la déclaration. Et aucun mandat.
      null,
      null,
      null,
      PRE_NOTIFICATION_DEFAULT_DAYS,
      // Rien à dire du contrat, et récurrent : le régime de l'immense majorité
      // des mandats, et celui qu'on corrige le moins souvent.
      MandateDefaults.initial(),
      // Interentreprises : le schéma du contrat signé avec la banque, et celui
      // de nos débiteurs, qui sont tous des professionnels.
      "B2B",
      null,
      null,
    );
  }

  /** Reconstruit une entité depuis sa ligne en base ; les VO revalident. */
  static reconstitute(snapshot: LegalEntitySnapshot): LegalEntity {
    return new LegalEntity(
      snapshot.id,
      snapshot.name,
      snapshot.legalForm,
      Siren.create(snapshot.siren),
      LegalAddress.create({
        line1: snapshot.addressLine1,
        line2: snapshot.addressLine2,
        postalCode: snapshot.postalCode,
        city: snapshot.city,
        countryCode: snapshot.countryCode,
      }),
      snapshot.rcs,
      snapshot.shareCapitalCents,
      snapshot.vatNumber,
      snapshot.ics === null ? null : CreditorIdentifier.create(snapshot.ics),
      accountOf(snapshot),
      snapshot.firstMandateIssuedAt,
      snapshot.preNotificationDays,
      MandateDefaults.create(snapshot.mandateContractDescription, snapshot.mandatePaymentType),
      snapshot.mandateScheme,
      snapshot.logoKey,
      snapshot.archivedAt,
    );
  }

  get name(): string {
    return this.nameValue;
  }

  get archived(): boolean {
    return this.archivedAtValue !== null;
  }

  /** L'entité a-t-elle un logo ? La seule question que l'écran pose. */
  get hasLogo(): boolean {
    return this.logoKeyValue !== null;
  }

  /** Où le logo est rangé, pour qui a le droit d'aller le chercher. */
  get logoKey(): string | null {
    return this.logoKeyValue;
  }

  /**
   * Attache le logo déjà rangé sous cette clé — méthode métier, et pas un
   * `repo.setLogo(id, key)` qui mettrait la règle du jour où il y en aura une
   * dans le handler appelant, donc nulle part pour le prochain.
   *
   * ⚠️ **Rien ne refuse ici**, délibérément : une entité archivée peut recevoir
   * un logo, et le logo ne conditionne pas `canCollect()`.
   *
   * @throws {InvalidLegalEntityError} clé vide.
   */
  attachLogo(key: string): void {
    this.logoKeyValue = requireText(key, "Clé de stockage du logo");
  }

  /**
   * Retire le logo. L'objet rangé n'est pas supprimé : un redépôt écrase la même
   * clé, et une suppression qui échouerait laisserait la base dire « pas de
   * logo » pendant que le bucket en garde un. La base est seule autorité.
   */
  detachLogo(): void {
    this.logoKeyValue = null;
  }

  /** Ce qui change sans conséquence sur les documents déjà émis — ils ont copié. */
  correctIdentity(input: {
    readonly name: string;
    readonly legalForm: string;
    readonly rcs: string;
    readonly shareCapitalCents: number;
    readonly vatNumber: string;
  }): void {
    this.nameValue = requireText(input.name, "Raison sociale");
    this.legalFormValue = requireText(input.legalForm, "Forme juridique");
    this.rcsValue = input.rcs.trim();
    this.shareCapitalCentsValue = requireCapital(input.shareCapitalCents);
    this.vatNumberValue = input.vatNumber.trim().toUpperCase();
  }

  moveTo(address: LegalAddress): void {
    this.addressValue = address;
  }

  /**
   * Attribue l'ICS. **Une seule fois** — le même en second appel est accepté
   * (une saisie rejouée n'est pas une faute), un autre est refusé.
   *
   * @throws {CreditorIdentifierIsImmutableError} un autre ICS est déjà en place.
   */
  assignCreditorIdentifier(ics: CreditorIdentifier): void {
    const current = this.icsValue;
    if (current !== null && current.value !== ics.value) {
      throw new CreditorIdentifierIsImmutableError(current.value, ics.value);
    }
    this.icsValue = ics;
  }

  /**
   * Le compte où l'argent arrive. Il change : on peut changer de banque.
   *
   * **C'est la recopie d'un RIB, en un seul geste** : titulaire, adresse, IBAN,
   * BIC. Un compte à moitié rempli ne se découvrirait qu'au rejet du lot, cinq
   * jours après l'envoi — {@link CreditorAccount} le rend inexprimable.
   *
   * 🔴 **Après le premier mandat, le titulaire et l'adresse sont GELÉS**, pour
   * la raison exacte qui rend l'ICS immuable : le papier signé les porte, et le
   * débiteur a autorisé CE créancier-là.
   *
   * ⚠️ L'IBAN et le BIC, eux, restent libres **pour toujours** — aucun mandat ne
   * les porte, et changer de banque ne contredit aucune signature. C'est
   * pourquoi le gel se mesure sur l'identité seule
   * ({@link CreditorAccount.sameIdentityAs}) et non sur l'objet entier.
   *
   * @throws {CreditorIdentityIsFrozenError} un mandat existe et le nom change.
   */
  setCreditorAccount(account: CreditorAccount): void {
    const current = this.creditorAccountValue;
    if (
      this.firstMandateIssuedAtValue !== null &&
      current !== null &&
      !current.sameIdentityAs(account)
    ) {
      throw new CreditorIdentityIsFrozenError(current.holder, account.holder);
    }
    this.creditorAccountValue = account;
  }

  /**
   * Le premier mandat vient d'être frappé : le créancier imprimé se fige.
   *
   * **Idempotent, et volontairement** : c'est le PREMIER qui compte, et ce fait
   * arrivera par un abonné à un événement — donc rejouable. Écraser la date au
   * second mandat déplacerait le moment du gel, c'est-à-dire la seule chose que
   * ce champ sert à dire.
   */
  noteFirstMandateIssued(at: Date): void {
    this.firstMandateIssuedAtValue ??= at;
  }

  /**
   * Le créancier imprimé est-il gelé ? La fiche l'affiche pour que le geste
   * soit refusé AVANT la saisie, et pas après.
   */
  get creditorIdentityFrozen(): boolean {
    return this.firstMandateIssuedAtValue !== null;
  }

  /** Le compte tel qu'il est recopié du RIB, ou `null`. L'IBAN ne sort pas d'ici. */
  get creditorAccount(): CreditorAccount | null {
    return this.creditorAccountValue;
  }

  /**
   * Le délai annoncé au débiteur entre la notification et le débit. Négocié avec
   * la banque, donc **de la donnée** : le renégocier est une saisie, pas un
   * déploiement — et deux entités peuvent ne pas avoir le même.
   */
  setPreNotificationDays(days: number): void {
    if (
      !Number.isInteger(days) ||
      days < PRE_NOTIFICATION_MIN_DAYS ||
      days > PRE_NOTIFICATION_MAX_DAYS
    ) {
      throw new InvalidLegalEntityError(
        "Délai de pré-notification",
        `entier entre ${PRE_NOTIFICATION_MIN_DAYS} et ${PRE_NOTIFICATION_MAX_DAYS} jours attendu`,
      );
    }
    this.preNotificationDaysValue = days;
  }

  get mandateDefaults(): MandateDefaults {
    return this.mandateDefaultsValue;
  }

  /**
   * Ce que les mandats de cette entité diront du contrat — zones 20 et 12.
   *
   * ⚠️ **Pas de gel après le premier mandat**, contrairement au titulaire et à
   * l'adresse du créancier. La raison est dans ce que chacun engage : le nom
   * gelé est celui que le débiteur a lu et signé, et en changer dirait qu'il a
   * autorisé quelqu'un d'autre. Une description de contrat, elle, n'est
   * qu'indicative — la norme le dit — et un mandat déjà signé garde la sienne,
   * imprimée sur son papier. Geler ici empêcherait de corriger une faute de
   * frappe pour tous les mandats à venir, sans rien protéger.
   */
  setMandateDefaults(defaults: MandateDefaults): void {
    this.mandateDefaultsValue = defaults;
  }

  get mandateScheme(): SepaScheme {
    return this.mandateSchemeValue;
  }

  /**
   * Change le schéma des mandats que cette entité frappera — CORE ou
   * interentreprises.
   *
   * 🔴 **Hors de `MandateDefaults`, et c'est voulu** : la commande des réglages
   * reconstruit cette valeur entière à chaque édition de la description, et un
   * schéma rangé dedans retomberait à son défaut sans que personne l'ait
   * décidé. Un changement de régime de prélèvement a sa méthode, sa commande et
   * son fait au journal.
   *
   * Aucun gel : les mandats déjà frappés ont figé le leur. Ce qui en découle —
   * les brouillons en cours deviennent caducs — est le travail de l'appelant.
   *
   * @returns vrai si le schéma a réellement changé.
   */
  changeMandateScheme(scheme: SepaScheme): boolean {
    if (scheme === this.mandateSchemeValue) {
      return false;
    }
    this.mandateSchemeValue = scheme;
    return true;
  }

  /** Une entité archivée n'émet plus rien, et ses documents passés restent. */
  archive(at: Date): void {
    this.archivedAtValue = at;
  }

  restore(): void {
    this.archivedAtValue = null;
  }

  /** Peut-elle émettre un prélèvement ? Il lui faut un ICS, un compte, et vivre. */
  canCollect(): boolean {
    return this.missingToCollect().length === 0;
  }

  /**
   * L'émetteur figé, à recopier sur un mandat ou une facture.
   *
   * @throws {EntityCannotCollectError} l'entité ne peut pas encaisser.
   */
  creditorSnapshot(): CreditorSnapshot {
    const missing = this.missingToCollect();
    if (missing.length > 0) {
      throw new EntityCannotCollectError(missing);
    }
    return {
      legalEntityId: this.id,
      name: this.nameValue,
      legalForm: this.legalFormValue,
      siren: this.siren.value,
      vatNumber: this.vatNumberValue,
      rcs: this.rcsValue,
      shareCapitalCents: this.shareCapitalCentsValue,
      addressLines: this.addressValue.lines(),
      // `canCollect()` vient de prouver les deux non nuls.
      ics: String(this.icsValue),
      creditorIban: String(this.creditorAccountValue?.iban),
      creditorBic: this.creditorAccountValue?.bic.value ?? null,
      accountHolder: this.creditorAccountValue?.holder ?? null,
      accountAddressLines: this.creditorAccountValue?.address.lines() ?? [],
      preNotificationDays: this.preNotificationDaysValue,
      mandateContractDescription: this.mandateDefaultsValue.contractDescription,
      mandatePaymentType: this.mandateDefaultsValue.paymentType,
      mandateScheme: this.mandateSchemeValue,
    };
  }

  /** L'état complet, à écrire tel quel. */
  toPersistence(): LegalEntitySnapshot {
    return {
      id: this.id,
      name: this.nameValue,
      legalForm: this.legalFormValue,
      siren: this.siren.value,
      addressLine1: this.addressValue.line1,
      addressLine2: this.addressValue.line2,
      postalCode: this.addressValue.postalCode,
      city: this.addressValue.city,
      countryCode: this.addressValue.countryCode,
      rcs: this.rcsValue,
      shareCapitalCents: this.shareCapitalCentsValue,
      vatNumber: this.vatNumberValue,
      ics: this.icsValue?.value ?? null,
      creditorIban: this.creditorAccountValue?.iban.value ?? null,
      creditorBic: this.creditorAccountValue?.bic.value ?? null,
      creditorAccountHolder: this.creditorAccountValue?.holder ?? null,
      creditorAccountLine1: this.creditorAccountValue?.address.line1 ?? null,
      creditorAccountLine2: this.creditorAccountValue?.address.line2 ?? null,
      creditorAccountPostalCode: this.creditorAccountValue?.address.postalCode ?? null,
      creditorAccountCity: this.creditorAccountValue?.address.city ?? null,
      creditorAccountCountryCode: this.creditorAccountValue?.address.countryCode ?? null,
      firstMandateIssuedAt: this.firstMandateIssuedAtValue,
      preNotificationDays: this.preNotificationDaysValue,
      mandateContractDescription: this.mandateDefaultsValue.contractDescription,
      mandatePaymentType: this.mandateDefaultsValue.paymentType,
      mandateScheme: this.mandateSchemeValue,
      logoKey: this.logoKeyValue,
      archivedAt: this.archivedAtValue,
    };
  }

  /**
   * Ce qui manque pour encaisser, nommé.
   *
   * Public, et pas seulement pour le message d'erreur : la fiche l'affiche telle
   * quelle. Le rédiger une seconde fois côté écran ferait deux définitions de
   * « complète », dont celle que l'utilisateur lit serait la moins surveillée.
   */
  missingToCollect(): readonly string[] {
    const missing: string[] = [];
    if (this.icsValue === null) {
      missing.push("l'identifiant créancier (ICS)");
    }
    if (this.creditorAccountValue === null) {
      missing.push("le compte bancaire de l'entité");
    }
    if (this.archivedAtValue !== null) {
      missing.push("l'entité est archivée");
    }
    return missing;
  }
}

function requireText(raw: string, field: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw new InvalidLegalEntityError(field, "obligatoire");
  }
  return trimmed;
}

/** Le capital s'imprime sur les mentions légales : entier, en centimes, positif. */
function requireCapital(cents: number): number {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new InvalidLegalEntityError("Capital social", "entier positif, en centimes");
  }
  return cents;
}

/**
 * Rebâtit le compte depuis les colonnes, ou rend `null`.
 *
 * L'IBAN décide seul : les autres colonnes sont arrivées après lui (2026-09-12),
 * et une ligne écrite avant n'en porte aucune. Les lire strictement ferait
 * disparaître le compte des entités existantes — un écran qui se vide tout seul
 * est pire qu'un écran incomplet.
 */
function accountOf(snapshot: LegalEntitySnapshot): CreditorAccount | null {
  if (snapshot.creditorIban === null || snapshot.creditorBic === null) {
    return null;
  }
  return CreditorAccount.create({
    holder: snapshot.creditorAccountHolder ?? snapshot.name,
    address: LegalAddress.create({
      line1: snapshot.creditorAccountLine1 ?? snapshot.addressLine1,
      line2: snapshot.creditorAccountLine2 ?? snapshot.addressLine2,
      postalCode: snapshot.creditorAccountPostalCode ?? snapshot.postalCode,
      city: snapshot.creditorAccountCity ?? snapshot.city,
      countryCode: snapshot.creditorAccountCountryCode ?? snapshot.countryCode,
    }),
    iban: Iban.create(snapshot.creditorIban),
    bic: Bic.create(snapshot.creditorBic),
  });
}
