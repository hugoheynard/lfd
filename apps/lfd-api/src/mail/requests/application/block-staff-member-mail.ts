import { Injectable } from "@nestjs/common";

import { StaffContacts } from "../../../staff/directory/domain/staff-contacts.js";
import {
  type DeferrableMailTemplate,
  type MailRequested,
  Mail,
} from "../../channels/requests/mail.js";
import {
  type StaffMemberMailDemand,
  StaffMemberMail,
  StaffMemberNotFoundError,
  StaffMemberUnreachableError,
} from "../../channels/requests/staff-member-mail.js";

/**
 * Le bloc implémente l'envoi « à un membre » : il lit l'adresse par la
 * lecture publiée de l'annuaire ({@link StaffContacts}, comme l'essai d'un
 * modèle), refuse une fiche inconnue, suspendue ou sans adresse, puis passe
 * par sa propre porte `send` — la clé de l'appelant telle quelle.
 */
@Injectable()
export class BlockStaffMemberMail extends StaffMemberMail {
  constructor(
    private readonly contacts: StaffContacts,
    private readonly mail: Mail,
  ) {
    super();
  }

  async sendToStaffMember<K extends DeferrableMailTemplate>(
    demand: StaffMemberMailDemand<K>,
  ): Promise<MailRequested> {
    const { staffUserId, ...rest } = demand;
    const contact = (await this.contacts.contactsOf([staffUserId])).get(staffUserId);
    if (contact === undefined) {
      throw new StaffMemberNotFoundError(staffUserId);
    }
    if (!contact.active) {
      throw new StaffMemberUnreachableError(staffUserId, "suspended");
    }
    if (contact.email.trim() === "") {
      throw new StaffMemberUnreachableError(staffUserId, "no_address");
    }
    return this.mail.send({
      template: rest.template,
      data: rest.data,
      idempotencyKey: rest.idempotencyKey,
      replyTo: rest.replyTo,
      subjects: rest.subjects ?? [],
      to: contact.email,
    });
  }
}
