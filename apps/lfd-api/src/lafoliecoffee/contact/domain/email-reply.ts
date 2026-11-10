import { EMAIL_REPLY_BOUNDS, type CustomerAudience } from "@lfd/contracts";

import { EmailAddress } from "../../account/domain/value-objects/email-address.js";
import type { CustomerRequestState, FrozenReason } from "./customer-request.js";
import type {
  EmailAuthentication,
  EmailReplyAttachment,
  ReportedOrderRef,
} from "./customer-request-details.js";
import { cutQuotedHistory, oneLine, replyTextOf, truncated } from "./email-reply-text.js";
import { EmailReplyMessageIdMissingError } from "./errors/email-reply-errors.js";
import type { MessageSender } from "./inbound-message.js";

/**
 * L'identifiant FIXE du motif système « Réponse à un e-mail », posé par la
 * migration `20261028230100_la_reponse_par_e_mail` (une donnée de référence,
 * pas un droit). Toute réponse reçue s'y range.
 */
export const EMAIL_REPLY_REASON_ID = "system_email_reply";

/** Ce qu'il faut pour ranger une réponse reçue par e-mail. */
export interface EmailReplyReception {
  readonly id: string;
  readonly reason: FrozenReason;
  readonly audience: CustomerAudience;
  readonly sender: MessageSender;
  /** La partie texte du message, et son HTML : le texte l'emporte. */
  readonly text: string | null;
  readonly html: string | null;
  /** Le compte PRÉSUMÉ (par l'adresse), et la société de la commande présumée. */
  readonly userId: string | null;
  readonly companyId: string | null;
  readonly at: Date;
  /** L'identifiant Resend du message reçu. */
  readonly messageId: string;
  readonly subject: string;
  readonly attachments: readonly EmailReplyAttachment[];
  readonly authentication: EmailAuthentication;
  readonly order: ReportedOrderRef | null;
}

/**
 * L'état d'une demande `email_reply` neuve (plan `plan-reponses-par-e-mail.md`,
 * §2). Rien ne s'y refuse pour sa longueur : le texte perd son historique
 * cité puis est TRONQUÉ ; l'objet, le nom et les pièces jointes sont bornés.
 * Seuls une adresse illisible et un identifiant absent sont refusés.
 *
 * @throws {InvalidEmailError} l'adresse d'expédition ne se lit pas.
 * @throws {EmailReplyMessageIdMissingError} sans identifiant de message.
 */
export function emailReplyState(input: EmailReplyReception): CustomerRequestState {
  const messageId = input.messageId.trim();
  if (messageId === "") {
    throw new EmailReplyMessageIdMissingError();
  }
  const email = EmailAddress.create(input.sender.email).value;
  const name = oneLine(input.sender.name, EMAIL_REPLY_BOUNDS.senderName);
  const body = cutQuotedHistory(replyTextOf(input.text, input.html));
  return {
    id: input.id,
    reason: input.reason,
    audience: input.audience,
    // Un expéditeur sans nom affiché est nommé par son adresse, plutôt que
    // par une valeur inventée.
    author: { name: name === "" ? email : name, email, phone: "" },
    body: truncated(body, EMAIL_REPLY_BOUNDS.body),
    userId: input.userId,
    companyId: input.companyId,
    receivedAt: input.at,
    handling: null,
    anonymizedAt: null,
    details: {
      kind: "email_reply",
      messageId,
      subject: oneLine(input.subject, EMAIL_REPLY_BOUNDS.subject),
      attachments: input.attachments.slice(0, EMAIL_REPLY_BOUNDS.attachments).map((file) => ({
        ...file,
        filename: oneLine(file.filename, EMAIL_REPLY_BOUNDS.attachmentName),
      })),
      authentication: input.authentication,
      order: input.order,
    },
  };
}
