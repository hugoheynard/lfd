import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/** Pourquoi l'avis d'un payeur ne permet pas encore de déposer. */
export type UnsentNoticeReason = "missing" | "queued" | "failed" | "unsendable";

/** Un payeur dont l'avis n'est pas parti. */
export interface UnsentNotice {
  readonly debtorName: string;
  readonly reason: UnsentNoticeReason;
}

const REASON_WORDING: Readonly<Record<UnsentNoticeReason, string>> = {
  missing: "aucun avis (lot préparé avant les avis)",
  queued: "avis en file, pas encore envoyé",
  failed: "envoi de l'avis refusé",
  unsendable: "aucune adresse — ni contact de facturation, ni détenteur",
};

/**
 * **Dépôt refusé : un avis de prélèvement n'est pas parti** (PA2). Mis en
 * file ne vaut pas envoyé — la pré-notification est due AVANT le débit, et
 * c'est l'envoi qu'on peut prouver, pas l'intention.
 */
export class CollectionNoticesNotSentError extends BusinessError {
  constructor(readonly unsent: readonly UnsentNotice[]) {
    super(
      "accounting.collection.notices_not_sent",
      `Dépôt refusé — l'avis de prélèvement n'est pas parti pour : ${unsent
        .map((notice) => `${notice.debtorName} (${REASON_WORDING[notice.reason]})`)
        .join(
          " ; ",
        )}. Attendre l'envoi d'un avis en file ; pour un échec ou une adresse manquante, renseigner un contact de facturation (ou l'adresse du détenteur), puis annuler le lot et le préparer de nouveau.`,
    );
  }
}

/** Un avis déjà envoyé, en échec ou non envoyable ne change plus d'état. */
export class CollectionNoticeNotQueuedError extends BusinessError {
  constructor(
    readonly noticeId: string,
    readonly status: string,
  ) {
    super(
      "accounting.collection.notice_not_queued",
      `L'avis de prélèvement ${noticeId} est « ${status} », pas en file : son envoi ne se rejoue pas. Pour en envoyer un autre, annuler le lot et le préparer de nouveau.`,
    );
  }
}

/** Un avis qui se contredit : aucun chemin du domaine ne le produit. */
export class InvalidCollectionNoticeError extends DomainError {
  constructor(readonly reason: string) {
    super(
      "accounting.collection.invalid_notice",
      `Avis de prélèvement incohérent : ${reason}. Prévenir la technique — la constitution est annulée, rien n'est parti.`,
    );
  }
}
