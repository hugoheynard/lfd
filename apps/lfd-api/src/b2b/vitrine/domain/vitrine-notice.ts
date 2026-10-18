import {
  VitrineNoticeAttemptRecordedError,
  VitrineNoticeNoRecipientError,
} from "./errors/vitrine-notice-errors.js";
import { VitrineSubscriberNotFoundError } from "./errors/vitrine-errors.js";
import type { VitrineNoticeAddressee } from "./vitrine-notice-audience.js";
import { VitrineNoticeText } from "./vitrine-notice-text.js";

/** Un destinataire et ce que le fournisseur a dit de son e-mail. */
export interface VitrineNoticeRecipientRow {
  readonly subscriberId: string;
  readonly contactEmail: string;
  /** `null` : pas encore tenté · `true` : accepté par le fournisseur · `false` : refusé ou à blanc. */
  readonly mailSent: boolean | null;
  readonly attemptedAt: Date | null;
}

export interface VitrineNoticeRow {
  readonly id: string;
  readonly authorStaffId: string;
  readonly subject: string;
  readonly message: string;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
  readonly recipients: readonly VitrineNoticeRecipientRow[];
}

export interface ComposeVitrineNotice {
  readonly id: string;
  readonly authorStaffId: string;
  readonly text: VitrineNoticeText;
  readonly idempotencyKey: string;
  readonly addressees: readonly VitrineNoticeAddressee[];
  readonly at: Date;
}

/**
 * **Une annonce aux abonnés de la vitrine** — un e-mail écrit au back-office,
 * un message par destinataire (plan vitrine §7, Hugo 2026-10-18).
 *
 * Ses invariants : un texte valide, au moins un destinataire, et un journal
 * qui ne se réécrit pas — l'issue d'un envoi se consigne une fois. Jamais
 * supprimée.
 */
export class VitrineNotice {
  private constructor(private state: VitrineNoticeRow) {}

  /** @throws {VitrineNoticeNoRecipientError} */
  static compose(input: ComposeVitrineNotice): VitrineNotice {
    if (input.addressees.length === 0) {
      throw new VitrineNoticeNoRecipientError();
    }
    return new VitrineNotice({
      id: input.id,
      authorStaffId: input.authorStaffId,
      subject: input.text.subject,
      message: input.text.message,
      idempotencyKey: input.idempotencyKey,
      createdAt: input.at,
      recipients: input.addressees.map((addressee) => ({
        subscriberId: addressee.subscriberId,
        contactEmail: addressee.contactEmail,
        mailSent: null,
        attemptedAt: null,
      })),
    });
  }

  /** Réhydrate depuis la base : le texte revalide. */
  static rehydrate(row: VitrineNoticeRow): VitrineNotice {
    const text = VitrineNoticeText.of(row.subject, row.message);
    return new VitrineNotice({ ...row, subject: text.subject, message: text.message });
  }

  /**
   * Consigne l'issue de l'e-mail d'un destinataire.
   *
   * @throws {VitrineSubscriberNotFoundError} il n'est pas destinataire.
   * @throws {VitrineNoticeAttemptRecordedError} son issue est déjà consignée.
   */
  recordAttempt(subscriberId: string, mailSent: boolean, at: Date): void {
    const recipient = this.state.recipients.find((r) => r.subscriberId === subscriberId);
    if (recipient === undefined) {
      throw new VitrineSubscriberNotFoundError(subscriberId);
    }
    if (recipient.mailSent !== null) {
      throw new VitrineNoticeAttemptRecordedError(subscriberId);
    }
    this.state = {
      ...this.state,
      recipients: this.state.recipients.map((r) =>
        r.subscriberId === subscriberId ? { ...r, mailSent, attemptedAt: at } : r,
      ),
    };
  }

  /** Les destinataires dont l'e-mail n'a pas encore été tenté. */
  get unattempted(): readonly VitrineNoticeRecipientRow[] {
    return this.state.recipients.filter((r) => r.mailSent === null);
  }

  get id(): string {
    return this.state.id;
  }

  get text(): VitrineNoticeText {
    return VitrineNoticeText.of(this.state.subject, this.state.message);
  }

  toPersistence(): VitrineNoticeRow {
    return this.state;
  }
}
