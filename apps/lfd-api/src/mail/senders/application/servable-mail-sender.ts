import {
  isMailSpace,
  MAIL_NATURES,
  validateStoredMailSenderIdentity,
  type MailNature,
  type MailSpace,
} from "@lfd/mail-blocks";

import type { PublishedMailSenderEntry } from "../../templates/effective-copy/published-mail-senders.js";

/** Une identité d'envoi telle que la base la rend. */
export interface StoredMailSender {
  readonly space: string;
  readonly nature: string;
  readonly senderName: string;
  readonly fromAddress: string;
  readonly replyToAddress: string | null;
}

/** Une identité servable, rangée sous son espace et sa nature (lot U5). */
export interface ServableMailSender {
  readonly space: MailSpace;
  readonly nature: MailNature;
  readonly entry: PublishedMailSenderEntry;
}

/**
 * L'identité d'un espace telle que l'envoi peut la servir — ou illisible
 * (forme revérifiée), et l'espace part sous l'identité par défaut. `null` :
 * la ligne n'est pas un espace ou une nature de ce code (rangée à la main).
 */
export function servableMailSender(row: StoredMailSender): ServableMailSender | null {
  const nature = MAIL_NATURES.find((known) => known === row.nature);
  if (!isMailSpace(row.space) || nature === undefined) {
    return null;
  }
  const identity = {
    senderName: row.senderName,
    fromAddress: row.fromAddress,
    replyToAddress: row.replyToAddress,
  };
  return {
    space: row.space,
    nature,
    entry:
      validateStoredMailSenderIdentity(identity).length > 0
        ? { kind: "unreadable" }
        : { kind: "servable", identity },
  };
}
