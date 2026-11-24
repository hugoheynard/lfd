import { BusinessError, ResourceNotFoundError } from "../../../platform/shared/errors/app-error.js";
import type { DeferrableMailTemplate, DeferredMailDemand, MailRequested } from "./mail.js";

/**
 * Une demande « à un membre du staff » : celle de {@link Mail.send}, avec la
 * fiche du destinataire à la place de son adresse — le bloc la lit dans
 * l'annuaire au moment d'écrire la demande.
 */
export type StaffMemberMailDemand<K extends DeferrableMailTemplate> = Omit<
  DeferredMailDemand<K>,
  "to"
> & {
  /** La fiche staff du destinataire. */
  readonly staffUserId: string;
};

/**
 * **Écrire à un membre du staff désigné par sa fiche** (doc
 * `documentation/payment/les-liens-de-paiement.md`, « Le lien d'essai ») :
 * une porte à part de `Mail` et de `StaffAudienceMail` (ISP). L'appelant ne
 * voit jamais l'adresse : un bloc qui n'a pas à connaître l'annuaire (le
 * bloc `payment`) écrit à une personne sans qu'aucune adresse ne transite par
 * lui, et ne peut écrire qu'à une fiche du staff.
 *
 * Déclarée et implémentée par le bloc `mail`, atteinte en « port uniquement ».
 */
export abstract class StaffMemberMail {
  /**
   * Écrit la demande dans l'`UnitOfWork` de l'appelant, à l'adresse que la
   * fiche porte aujourd'hui. Le refus vient AVANT toute écriture : la
   * transaction de l'appelant tombe avec lui.
   *
   * @throws {StaffMemberNotFoundError} aucune fiche sous cet identifiant.
   * @throws {StaffMemberUnreachableError} fiche suspendue, ou sans adresse.
   * @throws {MailRequestOutsideUnitOfWorkError} hors d'une `UnitOfWork`.
   */
  abstract sendToStaffMember<K extends DeferrableMailTemplate>(
    demand: StaffMemberMailDemand<K>,
  ): Promise<MailRequested>;
}

/** Aucune fiche du staff sous cet identifiant. */
export class StaffMemberNotFoundError extends ResourceNotFoundError {
  constructor(staffUserId: string) {
    super(
      "mail.staff_member.not_found",
      `Aucun membre de l'équipe ne porte l'identifiant ${staffUserId} : choisissez un ` +
        "destinataire dans la liste des membres actifs.",
    );
  }
}

/** La fiche existe, mais on ne peut pas lui écrire. */
export class StaffMemberUnreachableError extends BusinessError {
  constructor(staffUserId: string, reason: "suspended" | "no_address") {
    super(
      "mail.staff_member.unreachable",
      reason === "suspended"
        ? `Le membre de l'équipe ${staffUserId} est suspendu : on ne lui écrit pas. ` +
            "Choisissez un membre actif, ou rouvrez son accès dans Équipe et accès."
        : `Le membre de l'équipe ${staffUserId} n'a pas d'adresse e-mail sur sa fiche : ` +
            "complétez-la dans Équipe et accès, ou choisissez un autre membre.",
    );
  }
}
