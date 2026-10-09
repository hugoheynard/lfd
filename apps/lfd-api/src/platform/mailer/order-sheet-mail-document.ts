import type { MailAttachment } from "@lfd/mailer";

/**
 * **Le bon de commande joint à la confirmation** (plan
 * `documentation/order/plan-bon-public.md`, §2.4) : le nom remis au client et
 * les octets du PDF rangé. Même forme que la pièce de la facture.
 */
export interface OrderSheetMailDocument {
  /** `bon-de-commande-CMD-4812.pdf`. */
  readonly fileName: string;
  readonly pdfBase64: string;
}

/**
 * Les pièces d'un courriel, ou rien : une liste vide ne s'écrit pas, pour que
 * le message sans pièce reste exactement celui d'avant.
 */
export function withAttachments(attachments: readonly MailAttachment[]): {
  readonly attachments?: readonly MailAttachment[];
} {
  return attachments.length === 0 ? {} : { attachments };
}
