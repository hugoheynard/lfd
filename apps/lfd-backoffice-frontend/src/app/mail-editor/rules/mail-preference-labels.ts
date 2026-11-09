import type {
  MailConsentOrigin,
  MailConsentPlace,
  MailPreferenceListItemView,
  MailPreferenceStatus,
  MailSendSpace,
  MailUnsubscribeSource,
} from '@lfd/contracts';

import type { MailSendTone } from './mail-send-labels';

/**
 * **Le dictionnaire des désinscriptions et accords** (plan
 * `la-desinscription-et-l-accord.md`, lot C4) : le serveur sert les codes
 * du registre, l'écran les dit en français.
 */
export const MAIL_PREFERENCE_STATUS_LABELS: Readonly<Record<MailPreferenceStatus, string>> = {
  pending: 'En attente de confirmation',
  accepted: 'Inscrit',
  unsubscribed: 'Désinscrit',
};

export const MAIL_CONSENT_ORIGIN_LABELS: Readonly<Record<MailConsentOrigin, string>> = {
  direct: 'Accord donné à la société',
  partners: 'Case « partenaires »',
};

export const MAIL_CONSENT_PLACE_LABELS: Readonly<Record<MailConsentPlace, string>> = {
  signup: 'Inscription',
  preferences: 'Mes préférences',
  order: 'Commande',
  newsletter: 'Pied de page de la boutique',
  staff: 'Le staff',
};

export const MAIL_UNSUBSCRIBE_SOURCE_LABELS: Readonly<Record<MailUnsubscribeSource, string>> = {
  link: 'Lien de l’e-mail',
  one_click: 'Bouton de la messagerie',
  staff: 'Le staff, à la demande du client',
  group: 'Tout le groupe',
};

const STATUS_TONES: Readonly<Record<MailPreferenceStatus, MailSendTone>> = {
  pending: 'neutral',
  accepted: 'success',
  unsubscribed: 'warning',
};

/** La pastille d'une ligne : l'état en toutes lettres, la couleur ne fait que le redoubler. */
export function mailPreferenceBadge(row: Pick<MailPreferenceListItemView, 'status'>): {
  readonly label: string;
  readonly tone: MailSendTone;
} {
  return { label: MAIL_PREFERENCE_STATUS_LABELS[row.status], tone: STATUS_TONES[row.status] };
}

/** L'adresse telle que la liste la montre : masquée, ou « Adresse effacée ». */
export function mailPreferenceRecipient(
  row: Pick<MailPreferenceListItemView, 'recipient'>,
): string {
  return row.recipient ?? 'Adresse effacée';
}

/** D'où vient la ligne : le lieu de l'accord, sinon la source de la désinscription. */
export function mailPreferenceWhere(
  row: Pick<MailPreferenceListItemView, 'place' | 'unsubscribedSource'>,
): string {
  if (row.place !== null) return MAIL_CONSENT_PLACE_LABELS[row.place];
  if (row.unsubscribedSource !== null)
    return MAIL_UNSUBSCRIBE_SOURCE_LABELS[row.unsubscribedSource];
  return '';
}

/** L'instant le plus récent de la ligne : désinscription, sinon confirmation, sinon demande. */
export function mailPreferenceLastAt(
  row: Pick<MailPreferenceListItemView, 'requestedAt' | 'confirmedAt' | 'unsubscribedAt'>,
): string | null {
  return row.unsubscribedAt ?? row.confirmedAt ?? row.requestedAt;
}

/** Les critères de la liste, tels que l'écran les tient. Aucune adresse. */
export interface MailPreferenceFilters {
  readonly space: MailSendSpace | null;
  readonly status: MailPreferenceStatus | null;
}

export const NO_MAIL_PREFERENCE_FILTERS: MailPreferenceFilters = { space: null, status: null };

/** Les paramètres de `GET /admin/mail/preferences`. */
export function mailPreferenceQuery(
  filters: MailPreferenceFilters,
  cursor: string | null,
): Readonly<Record<string, string>> {
  const params: Record<string, string> = {};
  if (filters.space !== null) params['space'] = filters.space;
  if (filters.status !== null) params['status'] = filters.status;
  if (cursor !== null) params['cursor'] = cursor;
  return params;
}
