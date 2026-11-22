import { Injectable, Logger } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { StaffNoticeRecipients } from "../../../staff/notifications/domain/ports/staff-notice-recipients.js";
import {
  type DeferrableMailTemplate,
  type MailRequested,
  Mail,
} from "../../channels/requests/mail.js";
import {
  type StaffAudienceMailDemand,
  StaffAudienceMail,
} from "../../channels/requests/staff-audience-mail.js";

/** Le suffixe de la clé quand l'avis part à la boîte de l'équipe. */
const INBOX_KEY_SUFFIX = "inbox";

/**
 * Le bloc implémente l'envoi « à l'équipe » : il prend la lecture publiée du
 * staff ({@link StaffNoticeRecipients}), comme il prend `StaffContacts` pour
 * l'expéditeur, puis passe par sa propre porte `send` — une demande par
 * membre, chacune durable et idempotente sous sa clé.
 */
@Injectable()
export class BlockStaffAudienceMail extends StaffAudienceMail {
  private readonly logger = new Logger(BlockStaffAudienceMail.name);

  constructor(
    private readonly recipients: StaffNoticeRecipients,
    private readonly mail: Mail,
    private readonly config: AppConfig,
  ) {
    super();
  }

  async sendToStaffAudience<K extends DeferrableMailTemplate>(
    demand: StaffAudienceMailDemand<K>,
  ): Promise<readonly MailRequested[]> {
    const members = await this.recipients.recipientsOf(demand.template);
    if (members.length > 0) {
      const requested: MailRequested[] = [];
      for (const member of members) {
        requested.push(
          await this.mail.send({
            ...demand,
            to: member.email,
            idempotencyKey: `${demand.idempotencyKey}:${member.staffUserId}`,
          }),
        );
      }
      return requested;
    }
    return this.toInbox(demand);
  }

  private async toInbox<K extends DeferrableMailTemplate>(
    demand: StaffAudienceMailDemand<K>,
  ): Promise<readonly MailRequested[]> {
    const inbox = this.config.mailerConfig().staffInbox;
    if (inbox === null) {
      this.logger.warn(
        `Avis « ${demand.template} » (${demand.idempotencyKey}) : aucun destinataire réglé ni ` +
          "joignable, et aucune boîte d'équipe configurée (MAILER_STAFF_INBOX) — l'avis ne part pas. " +
          "Réglez ses destinataires dans Admin › Destinataires des avis.",
      );
      return [];
    }
    this.logger.warn(
      `Avis « ${demand.template} » (${demand.idempotencyKey}) : aucun destinataire réglé ni ` +
        "joignable — il part à la boîte de l'équipe. Réglez ses destinataires dans " +
        "Admin › Destinataires des avis.",
    );
    return [
      await this.mail.send({
        ...demand,
        to: inbox,
        idempotencyKey: `${demand.idempotencyKey}:${INBOX_KEY_SUFFIX}`,
      }),
    ];
  }
}
