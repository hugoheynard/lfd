import type { MailSpaceSenderState } from "../domain/mail-space-sender.js";
import { StoredMailSenderUnreadableError } from "../domain/mail-sender-errors.js";
import { isMailSpace, MAIL_NATURES } from "@lfd/mail-blocks";

/** Une ligne de `mail.mail_sender_identity`, telle que Prisma la rend. */
export interface MailSenderRow {
  readonly space: string;
  readonly nature: string;
  readonly revision: number;
  readonly senderName: string;
  readonly fromAddress: string;
  readonly replyToAddress: string | null;
  readonly changedAt: Date;
  readonly changedBy: string;
}

/**
 * Ligne → état. Un espace inconnu de ce code (ligne rangée à la main) est
 * illisible ; la forme de l'identité est revérifiée par l'agrégat.
 *
 * @throws {StoredMailSenderUnreadableError} l'espace ou la nature n'est pas de ce code.
 */
export function toSenderState(row: MailSenderRow): MailSpaceSenderState {
  const nature = MAIL_NATURES.find((known) => known === row.nature);
  if (!isMailSpace(row.space) || nature === undefined) {
    throw new StoredMailSenderUnreadableError(row.space);
  }
  return {
    space: row.space,
    nature,
    revision: row.revision,
    identity: {
      senderName: row.senderName,
      fromAddress: row.fromAddress,
      replyToAddress: row.replyToAddress,
    },
    changed: { at: row.changedAt, staffId: row.changedBy },
  };
}

/** Les colonnes d'un état réglé ; `null` pour un espace sans identité (rien à écrire). */
export function toSenderColumns(
  state: MailSpaceSenderState,
): Omit<MailSenderRow, "space" | "nature"> | null {
  if (state.identity === null || state.changed === null) {
    return null;
  }
  return {
    revision: state.revision,
    senderName: state.identity.senderName,
    fromAddress: state.identity.fromAddress,
    replyToAddress: state.identity.replyToAddress,
    changedAt: state.changed.at,
    changedBy: state.changed.staffId,
  };
}
