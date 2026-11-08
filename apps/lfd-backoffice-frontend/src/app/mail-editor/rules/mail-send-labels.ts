import type {
  MailSendDelivery,
  MailSendListItemView,
  MailSendScope,
  MailSendSpace,
  MailSendState,
  MailSendStepKind,
} from '@lfd/contracts';

/** Les tons d'une pastille d'envoi — ceux de `fold-badge`. */
export type MailSendTone = 'neutral' | 'info' | 'warning' | 'alert' | 'success';

/**
 * **Le dictionnaire du suivi des e-mails** (`plan-suivi-des-e-mails.md`,
 * décision 12) : le serveur sert des codes anglais, l'écran les dit en
 * français. `accepted` veut dire « Resend l'a accepté », rien de plus — le
 * mot « envoyé » n'apparaît pas, il mentirait sur ce qu'on sait.
 */
export const MAIL_SEND_STATE_LABELS: Readonly<Record<MailSendState, string>> = {
  requested: 'Demandé',
  sending: 'Envoi en cours',
  accepted: 'Accepté par Resend',
  failed: 'Échoué',
  refused: 'Refusé',
};

/** Le retour du fournisseur ; `null` (rien reçu) n'a pas de libellé à lui. */
export const MAIL_SEND_DELIVERY_LABELS: Readonly<Record<MailSendDelivery, string>> = {
  dry_run: 'À blanc — rien n’est parti',
  delayed: 'Retardé',
  delivered: 'Remis',
  complained: 'Signalé comme spam',
  bounced: 'Rebondi',
};

export const MAIL_SEND_STEP_LABELS: Readonly<Record<MailSendStepKind, string>> = {
  requested: 'Demandé',
  first_attempt: 'Premier essai',
  last_attempt: 'Dernier essai',
  accepted: 'Accepté par Resend',
  failed: 'Échoué',
  refused: 'Refusé',
  delayed: 'Retardé',
  delivered: 'Remis',
  complained: 'Signalé comme spam',
  bounced: 'Rebondi',
};

export const MAIL_SEND_SCOPE_LABELS: Readonly<Record<MailSendScope, string>> = {
  regular: 'Envois',
  probes: 'Sondes',
};

const STATE_TONES: Readonly<Record<MailSendState, MailSendTone>> = {
  requested: 'neutral',
  sending: 'neutral',
  accepted: 'info',
  failed: 'alert',
  refused: 'alert',
};

const DELIVERY_TONES: Readonly<Record<MailSendDelivery, MailSendTone>> = {
  dry_run: 'neutral',
  delayed: 'warning',
  delivered: 'success',
  complained: 'alert',
  bounced: 'alert',
};

/** Le genre d'un rebond (`bounce.type` de Resend), traduit ; le sous-genre reste tel quel. */
const DELIVERY_KIND_TYPES: Readonly<Record<string, string>> = {
  Permanent: 'Définitif',
  Transient: 'Passager',
  Undetermined: 'Indéterminé',
};

/** Ce que dit la pastille d'une ligne. */
export interface MailSendBadge {
  readonly label: string;
  readonly tone: MailSendTone;
}

/**
 * **La pastille d'un envoi** : l'état de la demande, puis le retour du
 * fournisseur s'il y en a un (« Accepté par Resend · Rebondi »). Le ton est
 * celui du pire des deux — un échec de notre côté l'emporte, sinon le retour.
 * Le texte dit tout : la couleur ne fait que le redoubler (RGAA 3.1).
 */
export function mailSendBadge(
  send: Pick<MailSendListItemView, 'state' | 'delivery'>,
): MailSendBadge {
  const state = MAIL_SEND_STATE_LABELS[send.state];
  if (send.delivery === null) {
    return { label: state, tone: STATE_TONES[send.state] };
  }
  const tone = STATE_TONES[send.state] === 'alert' ? 'alert' : DELIVERY_TONES[send.delivery];
  return { label: `${state} · ${MAIL_SEND_DELIVERY_LABELS[send.delivery]}`, tone };
}

/** « Définitif (Suppressed) » pour `Permanent/Suppressed` ; un genre inconnu reste tel quel. */
export function mailDeliveryKindLabel(kind: string): string {
  const [type = '', subType] = kind.split('/');
  const said = DELIVERY_KIND_TYPES[type] ?? type;
  return subType === undefined || subType === '' ? said : `${said} (${subType})`;
}

/** Les critères de la liste, tels que l'écran les tient. Aucune adresse : elle ne va jamais dans une URL. */
export interface MailSendFilters {
  readonly space: MailSendSpace | null;
  readonly template: string | null;
  readonly state: MailSendState | null;
  readonly delivery: MailSendDelivery | null;
  /** Jour de début, `AAAA-MM-JJ`, compris. */
  readonly from: string | null;
  /** Jour de fin, `AAAA-MM-JJ`, compris. */
  readonly to: string | null;
  readonly scope: MailSendScope;
}

export const NO_MAIL_SEND_FILTERS: MailSendFilters = {
  space: null,
  template: null,
  state: null,
  delivery: null,
  from: null,
  to: null,
  scope: 'regular',
};

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Minuit, heure du poste, du jour donné — décalé de `shift` jours. */
function localMidnight(day: string, shift: number): string | null {
  const match = DAY.exec(day);
  if (match === null) {
    return null;
  }
  const [, year, month, date] = match;
  return new Date(Number(year), Number(month) - 1, Number(date) + shift).toISOString();
}

/**
 * **Les paramètres de `GET /admin/mail/sends`** : les critères posés, la
 * période en instants (du minuit du premier jour au minuit qui suit le
 * dernier, l'heure du poste), le curseur de la page suivante.
 */
export function mailSendQuery(
  filters: MailSendFilters,
  cursor: string | null,
): Readonly<Record<string, string>> {
  const params: Record<string, string> = { scope: filters.scope };
  if (filters.space !== null) params['space'] = filters.space;
  if (filters.template !== null) params['template'] = filters.template;
  if (filters.state !== null) params['state'] = filters.state;
  if (filters.delivery !== null) params['delivery'] = filters.delivery;
  const from = filters.from === null ? null : localMidnight(filters.from, 0);
  const to = filters.to === null ? null : localMidnight(filters.to, 1);
  if (from !== null) params['from'] = from;
  if (to !== null) params['to'] = to;
  if (cursor !== null) params['cursor'] = cursor;
  return params;
}

const WHEN = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** « 8 nov. 2026, 14:05 ». */
export function mailSendWhen(iso: string): string {
  return WHEN.format(new Date(iso));
}

/** « 14:05 ». */
export function mailSendTime(iso: string): string {
  return TIME.format(new Date(iso));
}
