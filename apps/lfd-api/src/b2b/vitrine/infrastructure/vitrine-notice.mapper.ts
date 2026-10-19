import type { VitrineNoticeEntry } from "../domain/ports/vitrine-notice.reader.js";

/** Une ligne `vitrine_notice_recipients`, telle que Prisma la rend. */
interface VitrineNoticeRecipientRowShape {
  readonly subscriberId: string;
  readonly contactEmail: string;
  readonly mailSent: boolean | null;
  readonly attemptedAt: Date | null;
}

/** Une annonce et ses destinataires, tels que la base les rend. */
export interface VitrineNoticeRecord {
  readonly id: string;
  readonly authorStaffId: string;
  readonly subject: string;
  readonly message: string;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
  readonly recipients: readonly VitrineNoticeRecipientRowShape[];
}

/** Ligne → entrée de l'écran ; le nom de l'abonné est celui d'aujourd'hui, l'auteur reste un id. */
export function noticeToView(
  row: VitrineNoticeRecord,
  nameOf: ReadonlyMap<string, string>,
): VitrineNoticeEntry {
  return {
    id: row.id,
    authorStaffId: row.authorStaffId,
    subject: row.subject,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    recipients: row.recipients.map((r) => ({
      subscriberId: r.subscriberId,
      subscriberName: nameOf.get(r.subscriberId) ?? r.subscriberId,
      contactEmail: r.contactEmail,
      mailSent: r.mailSent,
      attemptedAt: r.attemptedAt?.toISOString() ?? null,
    })),
  };
}
