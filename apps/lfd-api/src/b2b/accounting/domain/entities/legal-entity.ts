import type { CreditorSnapshot } from "../creditor-snapshot.js";
import {
  CreditorIdentifierIsImmutableError,
  EntityCannotCollectError,
  InvalidLegalEntityError,
} from "../errors/accounting-errors.js";
import { CreditorIdentifier } from "../value-objects/creditor-identifier.js";
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
  readonly preNotificationDays: number;
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
    private creditorIbanValue: Iban | null,
    private preNotificationDaysValue: number,
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
      null,
      null,
      PRE_NOTIFICATION_DEFAULT_DAYS,
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
      snapshot.creditorIban === null ? null : Iban.create(snapshot.creditorIban),
      snapshot.preNotificationDays,
      snapshot.archivedAt,
    );
  }

  get name(): string {
    return this.nameValue;
  }

  get archived(): boolean {
    return this.archivedAtValue !== null;
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

  /** Le compte où l'argent arrive. Il change : on peut changer de banque. */
  setCreditorAccount(iban: Iban): void {
    this.creditorIbanValue = iban;
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
      creditorIban: String(this.creditorIbanValue),
      preNotificationDays: this.preNotificationDaysValue,
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
      creditorIban: this.creditorIbanValue?.value ?? null,
      preNotificationDays: this.preNotificationDaysValue,
      archivedAt: this.archivedAtValue,
    };
  }

  /** Ce qui manque pour encaisser, nommé — le message d'erreur en dépend. */
  private missingToCollect(): readonly string[] {
    const missing: string[] = [];
    if (this.icsValue === null) {
      missing.push("l'identifiant créancier (ICS)");
    }
    if (this.creditorIbanValue === null) {
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
