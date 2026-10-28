import { MailerReceiveError, type ReceivedMail, type ResendInboundReader } from "@lfd/mailer";

import { InboundMailReader } from "./inbound-mail.reader.js";
import { InboundMailUnreadableError } from "./inbound-mail-unreadable.error.js";

/**
 * Adaptateur : la lecture de `@lfd/mailer`, ses pannes traduites en
 * `InboundMailUnreadableError`. Sans clé Resend (`reader` à `null`), aucun
 * message ne se lit — et aucun n'arrive : la réception se règle chez Resend.
 */
export class ResendInboundMailReader extends InboundMailReader {
  constructor(private readonly reader: ResendInboundReader | null) {
    super();
  }

  async read(emailId: string): Promise<ReceivedMail> {
    if (this.reader === null) {
      throw new InboundMailUnreadableError(emailId, "aucune clé Resend configurée");
    }
    try {
      return await this.reader.read(emailId);
    } catch (error) {
      if (error instanceof MailerReceiveError) {
        throw new InboundMailUnreadableError(emailId, error.message, error);
      }
      throw error;
    }
  }
}
