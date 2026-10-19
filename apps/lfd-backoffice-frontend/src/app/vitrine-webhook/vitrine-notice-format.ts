import {
  VITRINE_NOTICE_MESSAGE_MAX_LENGTH,
  VITRINE_NOTICE_SUBJECT_MAX_LENGTH,
  type VitrineNoticeView,
  type VitrineSubscriberView,
} from '@lfd/contracts';
import type { FoldBadgeVariant } from 'fold-ng';

/** Ce que l'écran a saisi pour une annonce. */
export interface VitrineNoticeDraft {
  readonly subject: string;
  readonly message: string;
  readonly selectedCount: number;
}

/** Ce qui empêche de passer à l'aperçu, en clair — ou `''`. Le serveur reste juge. */
export function vitrineNoticeIssue(draft: VitrineNoticeDraft): string {
  const subject = draft.subject.trim();
  if (subject === '') return 'L’objet est obligatoire.';
  if (subject.length > VITRINE_NOTICE_SUBJECT_MAX_LENGTH) {
    return `L’objet tient en ${String(VITRINE_NOTICE_SUBJECT_MAX_LENGTH)} caractères au plus.`;
  }
  const message = draft.message.trim();
  if (message === '') return 'Le message est obligatoire.';
  if (message.length > VITRINE_NOTICE_MESSAGE_MAX_LENGTH) {
    return `Le message tient en ${String(VITRINE_NOTICE_MESSAGE_MAX_LENGTH)} caractères au plus.`;
  }
  if (draft.selectedCount === 0) return 'Choisissez au moins un destinataire.';
  return '';
}

/** Les abonnés à qui l'on peut écrire : ceux qui ont un contact, coupés compris. */
export function reachable(subscribers: readonly VitrineSubscriberView[]): readonly string[] {
  return subscribers.filter((s) => s.contactEmail !== null).map((s) => s.id);
}

/**
 * La sélection telle qu'elle part : `null` quand tous ceux qui ont un contact
 * sont cochés (« tous »), sinon la liste.
 */
export function noticeSelection(
  subscribers: readonly VitrineSubscriberView[],
  selected: ReadonlySet<string>,
): readonly string[] | null {
  const all = reachable(subscribers);
  const chosen = all.filter((id) => selected.has(id));
  return chosen.length === all.length ? null : chosen;
}

export type NoticeOutcome = 'accepted' | 'refused' | 'pending';

/** L'issue d'un e-mail : `mailSent` atteste l'acceptation par le fournisseur, pas l'arrivée. */
export function noticeOutcome(mailSent: boolean | null): NoticeOutcome {
  if (mailSent === null) return 'pending';
  return mailSent ? 'accepted' : 'refused';
}

export const NOTICE_OUTCOME_LABELS: Readonly<Record<NoticeOutcome, string>> = {
  accepted: 'Accepté par l’envoi',
  refused: 'Non envoyé',
  pending: 'Pas tenté',
};

export const NOTICE_OUTCOME_VARIANTS: Readonly<Record<NoticeOutcome, FoldBadgeVariant>> = {
  accepted: 'success',
  refused: 'alert',
  pending: 'warning',
};

/** L'auteur par son nom — ou par son id quand l'annuaire ne le connaît plus. */
export function noticeAuthor(notice: VitrineNoticeView): string {
  return notice.authorName ?? notice.authorStaffId;
}

/** Combien de destinataires restent « pas tentés » : ce que « Reprendre l'envoi » reprendrait. */
export function unattemptedCount(notice: VitrineNoticeView): number {
  return notice.recipients.filter((recipient) => recipient.mailSent === null).length;
}
