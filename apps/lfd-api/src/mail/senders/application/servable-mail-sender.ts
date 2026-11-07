import { isMailSpace, validateMailSenderIdentity, type MailSpace } from "@lfd/mail-blocks";

import type { PublishedMailSenderEntry } from "../../templates/effective-copy/published-mail-senders.js";

/** Une identité d'envoi telle que la base la rend. */
export interface StoredMailSender {
  readonly space: string;
  readonly senderName: string;
  readonly fromAddress: string;
  readonly replyToAddress: string | null;
}

/**
 * L'identité d'un espace telle que l'envoi peut la servir — ou illisible
 * (forme revérifiée), et l'espace part sous l'identité par défaut. `null` :
 * la ligne n'est pas un espace de ce code (rangée à la main).
 */
export function servableMailSender(
  row: StoredMailSender,
): readonly [MailSpace, PublishedMailSenderEntry] | null {
  if (!isMailSpace(row.space)) {
    return null;
  }
  const identity = {
    senderName: row.senderName,
    fromAddress: row.fromAddress,
    replyToAddress: row.replyToAddress,
  };
  return [
    row.space,
    validateMailSenderIdentity(identity).length > 0
      ? { kind: "unreadable" }
      : { kind: "servable", identity },
  ];
}
