import type { MailBrandCode } from "../../../requests/domain/value-objects/mail-brand.js";
import type { StoredMailDelivery, StoredMailStatus } from "../services/mail-send-state.js";

/** Les filtres de la liste, en valeurs de la base. */
export interface MailSendFilter {
  readonly space: string | null;
  readonly template: string | null;
  readonly status: StoredMailStatus | null;
  /** Un retour du fournisseur, ou `dry_run` : acceptée sans identifiant Resend. */
  readonly delivery: StoredMailDelivery | "dry_run" | null;
  /** Bornes de `requested_at`, incluse puis exclue. */
  readonly from: Date | null;
  readonly to: Date | null;
  /** Les envois de ces modèles seulement (la sonde, listée à part). */
  readonly onlyTemplates: readonly string[] | null;
  /** Sans les envois de ces modèles (la liste ordinaire). */
  readonly exceptTemplates: readonly string[];
}

/** La position d'une ligne dans l'ordre de la liste : la page suivante part d'après. */
export interface MailSendPosition {
  readonly rank: number;
  readonly requestedAt: Date;
  readonly id: string;
}

/** Une demande, telle que le suivi la lit — sans la raison d'un échec. */
export interface MailSendRecord {
  readonly id: string;
  readonly template: string;
  /** L'espace (`mail_request.brand`). */
  readonly space: MailBrandCode;
  readonly recipient: string;
  readonly locale: string | null;
  readonly status: StoredMailStatus;
  readonly providerId: string | null;
  readonly requestedAt: Date;
  readonly sentAt: Date | null;
  readonly failedAt: Date | null;
  readonly firstAttemptAt: Date | null;
  readonly lastAttemptAt: Date | null;
  readonly attempts: number;
  readonly documentVersion: number | null;
  readonly delivery: StoredMailDelivery | null;
  readonly deliveryAt: Date | null;
  readonly deliveryKind: string | null;
}

/**
 * Port de LECTURE du suivi des envois (`le-suivi-des-e-mails.md`, T2).
 * Il ne rend jamais `failure_reason` : elle peut citer l'adresse, et ne se
 * sert qu'avec une révélation ({@link MailRecipientReader}).
 */
export abstract class MailSendReader {
  /**
   * Au plus `limit` envois, les problèmes d'abord (`problemRankOf`), puis les
   * plus récents ; après `after` s'il est donné.
   */
  abstract page(
    filter: MailSendFilter,
    after: MailSendPosition | null,
    limit: number,
  ): Promise<readonly MailSendRecord[]>;

  /**
   * Ces envois-là, dans l'ordre de la liste (problèmes d'abord). Un
   * identifiant purgé depuis est simplement absent.
   */
  abstract byIds(ids: readonly string[]): Promise<readonly MailSendRecord[]>;

  /** `null` : l'envoi n'est pas au suivi. */
  abstract detail(id: string): Promise<MailSendRecord | null>;
}
