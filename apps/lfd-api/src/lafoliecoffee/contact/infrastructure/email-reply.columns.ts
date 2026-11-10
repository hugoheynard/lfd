import type {
  CustomerRequestDetails,
  EmailAuthentication,
  EmailReplyAttachment,
} from "../domain/customer-request-details.js";
import { UNKNOWN_AUTHENTICATION } from "../domain/inbound-message.js";

/**
 * Les colonnes `email_*` d'une demande `email_reply` (plan
 * `plan-reponses-par-e-mail.md`, R1), dans les deux sens. Le JSON est relu
 * DÉFENSIVEMENT : une forme inattendue rend une liste vide ou un verdict
 * inconnu — jamais une pièce jointe ni un « vérifié » inventés.
 */

/** Les colonnes à écrire ; `null` partout pour un autre type. */
export interface EmailReplyColumns {
  readonly emailMessageId: string | null;
  readonly emailSubject: string | null;
  readonly emailAttachments: readonly EmailReplyAttachment[] | null;
  readonly emailAuthentication: EmailAuthentication | null;
}

export function emailReplyColumnsOf(details: CustomerRequestDetails): EmailReplyColumns {
  if (details.kind !== "email_reply") {
    return {
      emailMessageId: null,
      emailSubject: null,
      emailAttachments: null,
      emailAuthentication: null,
    };
  }
  return {
    emailMessageId: details.messageId,
    emailSubject: details.subject,
    emailAttachments: details.attachments,
    emailAuthentication: details.authentication,
  };
}

/** Les pièces jointes rangées ; une entrée mal formée est tue. */
export function attachmentsOf(value: unknown): readonly EmailReplyAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry: unknown): EmailReplyAttachment[] => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }
    const filename = field(entry, "filename");
    const contentType = field(entry, "contentType");
    const sizeBytes: unknown = Reflect.get(entry, "sizeBytes");
    if (filename === null || contentType === null || typeof sizeBytes !== "number") {
      return [];
    }
    return [{ filename, contentType, sizeBytes }];
  });
}

/** Le verdict rangé ; illisible, il est inconnu — donc non vérifié. */
export function authenticationOf(value: unknown): EmailAuthentication {
  if (typeof value !== "object" || value === null) {
    return UNKNOWN_AUTHENTICATION;
  }
  return {
    spf: field(value, "spf") ?? UNKNOWN_AUTHENTICATION.spf,
    dkim: field(value, "dkim") ?? UNKNOWN_AUTHENTICATION.dkim,
    dmarc: field(value, "dmarc") ?? UNKNOWN_AUTHENTICATION.dmarc,
    dkimAligned: Reflect.get(value, "dkimAligned") === true,
  };
}

function field(source: object, key: string): string | null {
  const value: unknown = Reflect.get(source, key);
  return typeof value === "string" ? value : null;
}
