import type {
  CustomerAccessRowView,
  CustomerAccessState,
  InviteCompanyMemberPayload,
} from '@lfd/contracts';
import type { FoldBadgeVariant } from 'fold-ng';

/** Les puces au-dessus de la table. `lapsed` réunit l'expiré et le désactivé. */
export type AccessFilter = 'all' | 'no_holder' | 'invited' | 'active' | 'lapsed';

export const ACCESS_FILTERS: readonly { readonly value: AccessFilter; readonly label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'no_holder', label: 'Sans détenteur' },
  { value: 'invited', label: 'Invité' },
  { value: 'active', label: 'Activé' },
  { value: 'lapsed', label: 'Expiré / désactivé' },
];

export function isAccessFilter(value: string): value is AccessFilter {
  return ACCESS_FILTERS.some((filter) => filter.value === value);
}

/** Ce que dit chaque état, dans les mots du comptoir. */
export const STATE_LABELS: Readonly<Record<CustomerAccessState, string>> = {
  no_holder: 'Sans détenteur',
  none: 'Aucun accès',
  invited: 'Invité',
  expired: 'Lien expiré',
  active: 'Activé',
  disabled: 'Désactivé',
};

export const STATE_VARIANTS: Readonly<Record<CustomerAccessState, FoldBadgeVariant>> = {
  no_holder: 'alert',
  none: 'neutral',
  invited: 'info',
  expired: 'warning',
  active: 'success',
  disabled: 'neutral',
};

/**
 * L'ordre de la table : ce qui appelle un geste d'abord. Un compte sans
 * détenteur ne peut rien recevoir ; un lien expiré attend une relance ; un
 * activé n'attend plus rien.
 */
const STATE_RANK: Readonly<Record<CustomerAccessState, number>> = {
  no_holder: 0,
  none: 1,
  expired: 2,
  invited: 3,
  disabled: 4,
  active: 5,
};

export function matchesFilter(row: CustomerAccessRowView, filter: AccessFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'lapsed':
      return row.state === 'expired' || row.state === 'disabled';
    default:
      return row.state === filter;
  }
}

/** Par société (la sienne ou son principal), ou par l'adresse et le nom du détenteur. */
export function matchesSearch(row: CustomerAccessRowView, term: string): boolean {
  const needle = normalize(term);
  if (needle === '') {
    return true;
  }
  const haystack = [
    row.companyName,
    row.parent?.companyName ?? '',
    row.holder?.email ?? '',
    row.holder === null ? '' : `${row.holder.firstName} ${row.holder.lastName}`,
  ];
  return haystack.some((value) => normalize(value).includes(needle));
}

/** État, puis société — l'ordre de lecture demandé. */
export function sortRows(rows: readonly CustomerAccessRowView[]): readonly CustomerAccessRowView[] {
  return [...rows].sort(
    (a, b) =>
      STATE_RANK[a.state] - STATE_RANK[b.state] ||
      a.companyName.localeCompare(b.companyName, 'fr', { sensitivity: 'base' }),
  );
}

/** Une relance n'a de sens que pour un détenteur invité, ou dont le lien a expiré. */
export function canResend(row: CustomerAccessRowView): boolean {
  return row.holder !== null && (row.state === 'invited' || row.state === 'expired');
}

/**
 * La relance : le même appel que la fiche (`inviteMember`), idempotent sur
 * l'adresse. Le rôle est `owner` parce que c'est le détenteur — constaté,
 * jamais choisi, comme la fiche l'envoie.
 */
export function resendPayload(row: CustomerAccessRowView): InviteCompanyMemberPayload | null {
  if (row.holder === null) {
    return null;
  }
  const { email, firstName, lastName, phone } = row.holder;
  return { email, firstName, lastName, phone, role: 'owner' };
}

/** Le sort de l'envoi, pas arrondi : un « c'est parti » de politesse ferait attendre un e-mail qui n'arrivera pas. */
export function resendMessage(mailSent: boolean, email: string): string {
  return mailSent
    ? `E-mail d'accès parti à ${email}.`
    : `L'e-mail d'accès n'est pas parti pour ${email} — prévenez le client, ou copiez-lui un lien depuis « Accès à remettre ».`;
}

/** « Activé le 3 octobre 2026 », ou la date avouée inconnue. */
export function activatedLabel(row: CustomerAccessRowView): string | null {
  if (row.state !== 'active') {
    return null;
  }
  return row.activatedAt === null
    ? 'Activé (date inconnue)'
    : `Activé le ${formatDay(row.activatedAt)}`;
}

/** « Invité le 3 octobre 2026 » — la dernière invitation émise ou renouvelée. */
export function invitedLabel(row: CustomerAccessRowView): string | null {
  if (row.lastInvitedAt === null || row.state === 'active') {
    return null;
  }
  return `Dernière invitation le ${formatDay(row.lastInvitedAt)}`;
}

/** « 2 autres · 1 activé », ou rien quand le détenteur est seul. */
export function membersLabel(row: CustomerAccessRowView): string {
  if (row.otherMembers === 0) {
    return '—';
  }
  const others = row.otherMembers === 1 ? '1 autre' : `${row.otherMembers} autres`;
  const active = row.otherMembersActive === 1 ? '1 activé' : `${row.otherMembersActive} activés`;
  return `${others} · ${active}`;
}

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}
