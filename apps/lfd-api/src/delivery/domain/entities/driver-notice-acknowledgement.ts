import {
  DriverNoticeOutdatedError,
  DriverNoticeWithoutStaffError,
} from "../errors/driver-notice-errors.js";
import type { DriverInformationNotice } from "../value-objects/driver-information-notice.js";

/**
 * **« J'ai compris »** — le livreur a lu UNE version du texte d'information
 * (`documentation/legal/rgpd-livreur.md`, §7 point 2).
 *
 * Un fait, pas un consentement : il prouve que le texte a été montré, il
 * n'autorise rien et ne se retire pas. Ce que la factory garantit : on n'accuse
 * que la version COURANTE — accuser une version périmée daterait la lecture
 * d'un texte que la personne n'a pas vu.
 */
export class DriverNoticeAcknowledgement {
  private constructor(
    readonly staffUserId: string,
    readonly version: number,
    readonly acknowledgedAt: Date,
  ) {}

  /**
   * @throws {DriverNoticeWithoutStaffError} aucune fiche staff.
   * @throws {DriverNoticeOutdatedError} la version lue n'est plus la courante.
   */
  static acknowledge(input: {
    readonly staffUserId: string;
    readonly readVersion: number;
    readonly current: DriverInformationNotice;
    readonly at: Date;
  }): DriverNoticeAcknowledgement {
    if (input.staffUserId.trim() === "") {
      throw new DriverNoticeWithoutStaffError();
    }
    if (input.readVersion !== input.current.version) {
      throw new DriverNoticeOutdatedError();
    }
    return new DriverNoticeAcknowledgement(input.staffUserId, input.readVersion, input.at);
  }
}
