import {
  RecipientNameRequiredError,
  SuspendedStaffRecipientError,
  UnknownStaffRecipientError,
} from "../errors/dossier-recipient-errors.js";
import { RecipientEmail } from "../value-objects/recipient-email.value-object.js";

/**
 * **Une fiche du personnel telle que l'annuaire la donne aujourd'hui** — la
 * forme que le fournil en attend, déclarée ici pour que le domaine ne
 * dépende de personne. L'annuaire la sert par son port `StaffContacts`.
 */
export interface DossierStaffCard {
  readonly staffUserId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  /** Vide quand la fiche n'en porte pas. */
  readonly jobTitle: string;
  /** `false` : la fiche est suspendue. */
  readonly active: boolean;
}

/**
 * Une personne du personnel, par RÉFÉRENCE : son nom et son adresse ne sont
 * pas gardés, ils se relisent (décision 4). `card` est la fiche lue au
 * chargement — `null` si elle n'existe plus.
 */
export interface StaffRecipientTarget {
  readonly kind: "staff";
  readonly staffUserId: string;
  readonly card: DossierStaffCard | null;
}

/** Une autre personne, saisie en entier. */
export interface ExternalRecipientTarget {
  readonly kind: "external";
  readonly email: RecipientEmail;
  readonly firstName: string;
  readonly lastName: string;
  readonly jobTitle: string | null;
}

export type DossierRecipientTarget = StaffRecipientTarget | ExternalRecipientTarget;

/** Qui l'a inscrit, et quand. */
export interface RecipientAuthorship {
  readonly id: string;
  readonly addedBy: string;
  readonly addedAt: Date;
}

/**
 * **Un destinataire du dossier du jour** (plan
 * `documentation/production/plan-envoi-du-dossier.md`, décision 4, lot E2).
 *
 * Ses factories refusent ce qui ne pourrait pas recevoir le dossier : une
 * fiche inconnue ou suspendue, un externe sans nom, une adresse fausse. Le
 * doublon, lui, se juge contre la liste : c'est {@link DossierRecipients}.
 */
export class DossierRecipient {
  private constructor(
    readonly id: string,
    readonly target: DossierRecipientTarget,
    readonly addedBy: string,
    readonly addedAt: Date,
  ) {}

  /**
   * @param card la fiche lue dans l'annuaire, `null` si l'id n'y est pas.
   * @throws {UnknownStaffRecipientError} la fiche n'existe pas.
   * @throws {SuspendedStaffRecipientError} la fiche est suspendue.
   */
  static ofStaff(
    staffUserId: string,
    card: DossierStaffCard | null,
    by: RecipientAuthorship,
  ): DossierRecipient {
    if (card === null) {
      throw new UnknownStaffRecipientError(staffUserId);
    }
    if (!card.active) {
      throw new SuspendedStaffRecipientError(
        personName(card.firstName, card.lastName, staffUserId),
      );
    }
    return new DossierRecipient(
      by.id,
      { kind: "staff", staffUserId, card },
      by.addedBy,
      by.addedAt,
    );
  }

  /**
   * Le poste vide se lit comme absent : il est facultatif.
   *
   * @throws {InvalidRecipientEmailError} l'adresse est manifestement fausse.
   * @throws {RecipientNameRequiredError} le prénom ou le nom est vide.
   */
  static ofExternal(
    input: {
      readonly email: string;
      readonly firstName: string;
      readonly lastName: string;
      readonly jobTitle?: string | null | undefined;
    },
    by: RecipientAuthorship,
  ): DossierRecipient {
    const email = RecipientEmail.of(input.email);
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (firstName === "") {
      throw new RecipientNameRequiredError("firstName");
    }
    if (lastName === "") {
      throw new RecipientNameRequiredError("lastName");
    }
    const jobTitle = input.jobTitle?.trim() ?? "";
    return new DossierRecipient(
      by.id,
      { kind: "external", email, firstName, lastName, jobTitle: jobTitle === "" ? null : jobTitle },
      by.addedBy,
      by.addedAt,
    );
  }

  /** Une ligne relue : ses invariants ont été jugés à l'inscription. */
  static restore(target: DossierRecipientTarget, by: RecipientAuthorship): DossierRecipient {
    return new DossierRecipient(by.id, target, by.addedBy, by.addedAt);
  }

  /** L'adresse à laquelle le dossier part aujourd'hui ; `null` pour une fiche disparue. */
  get email(): string | null {
    if (this.target.kind === "external") {
      return this.target.email.value;
    }
    return this.target.card === null ? null : this.target.card.email;
  }

  /** « Prénom Nom » — l'id de la fiche, à défaut de mieux. */
  get label(): string {
    if (this.target.kind === "external") {
      return personName(this.target.firstName, this.target.lastName, this.id);
    }
    const { card, staffUserId } = this.target;
    return card === null ? staffUserId : personName(card.firstName, card.lastName, staffUserId);
  }
}

function personName(firstName: string, lastName: string, fallback: string): string {
  const name = `${firstName} ${lastName}`.trim();
  return name === "" ? fallback : name;
}
