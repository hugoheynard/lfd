import {
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

/**
 * Une autre personne, saisie. Seule l'adresse est requise (Hugo,
 * 2026-10-06) : le prénom et le nom sont `null` quand on ne les a pas.
 */
export interface ExternalRecipientTarget {
  readonly kind: "external";
  readonly email: RecipientEmail;
  readonly firstName: string | null;
  readonly lastName: string | null;
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
 * `documentation/production/dossier-prod-du-jour.md`, décision 4, lot E2).
 *
 * Ses factories refusent ce qui ne pourrait pas recevoir le dossier : une
 * fiche inconnue ou suspendue, une adresse fausse. Le
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
   * Seule l'adresse est requise : prénom, nom et poste sont facultatifs, et
   * un champ vide se lit comme absent (`null`).
   *
   * @throws {InvalidRecipientEmailError} l'adresse est manifestement fausse.
   */
  static ofExternal(
    input: {
      readonly email: string;
      readonly firstName?: string | null | undefined;
      readonly lastName?: string | null | undefined;
      readonly jobTitle?: string | null | undefined;
    },
    by: RecipientAuthorship,
  ): DossierRecipient {
    return new DossierRecipient(
      by.id,
      {
        kind: "external",
        email: RecipientEmail.of(input.email),
        firstName: optionalText(input.firstName),
        lastName: optionalText(input.lastName),
        jobTitle: optionalText(input.jobTitle),
      },
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

  /**
   * « Prénom Nom » ; « un destinataire externe » pour un externe sans nom —
   * jamais son adresse : ce libellé part au journal, qui n'écrit aucun e-mail.
   * Une fiche disparue se nomme par son id, à défaut de mieux.
   */
  get label(): string {
    if (this.target.kind === "external") {
      return personName(
        this.target.firstName ?? "",
        this.target.lastName ?? "",
        UNNAMED_EXTERNAL_LABEL,
      );
    }
    const { card, staffUserId } = this.target;
    return card === null ? staffUserId : personName(card.firstName, card.lastName, staffUserId);
  }
}

/** Le libellé d'un externe dont on n'a ni prénom ni nom. */
export const UNNAMED_EXTERNAL_LABEL = "un destinataire externe";

function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function personName(firstName: string, lastName: string, fallback: string): string {
  const name = `${firstName} ${lastName}`.trim();
  return name === "" ? fallback : name;
}
