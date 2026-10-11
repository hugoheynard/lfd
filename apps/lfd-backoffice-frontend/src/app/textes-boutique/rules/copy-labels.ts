import type { ShopCopyEntryView } from '@lfd/contracts';

/**
 * Ce que dit un nom de texte, en clair — lu au dernier segment de la clé, ou
 * aux deux derniers quand le dernier seul ne dit rien (`empty.title`).
 */
const LABELS: Readonly<Record<string, string>> = {
  'empty.title': 'Vide — titre',
  'empty.subtitle': 'Vide — sous-titre',
  kicker: 'Surtitre',
  eyebrow: 'Surtitre',
  title: 'Titre',
  screenTitle: 'Titre de l’écran',
  subtitle: 'Sous-titre',
  lede: 'Chapô',
  lead: 'Chapô',
  intro: 'Introduction',
  cta: 'Bouton',
  ctaIdle: 'Bouton (au repos)',
  hint: 'Aide',
  placeholder: 'Exemple dans le champ',
  label: 'Libellé',
  note: 'Note',
  detail: 'Détail',
  action: 'Action',
  close: 'Fermer',
  cancel: 'Annuler',
  submit: 'Envoyer',
  retry: 'Réessayer',
  loading: 'Pendant le chargement',
  tag: 'Étiquette',
  badge: 'Pastille',
  pitch: 'Accroche',
  optional: 'Facultatif',
  emptyTitle: 'Vide — titre',
  emptySubtitle: 'Vide — sous-titre',
  loadFailedTitle: 'Échec de lecture — titre',
  loadFailedBody: 'Échec de lecture — texte',
  errorTitle: 'Erreur — titre',
  errorSubtitle: 'Erreur — sous-titre',
};

/** Les rôles qu'un segment composé porte en fin de nom : `pickupTitle` → « Titre — pickup ». */
const ROLE_SUFFIXES: readonly (readonly [string, string])[] = [
  ['Placeholder', 'Exemple dans le champ'],
  ['Subtitle', 'Sous-titre'],
  ['Title', 'Titre'],
  ['Hint', 'Aide'],
  ['Label', 'Libellé'],
  ['Cta', 'Bouton'],
  ['Note', 'Note'],
  ['Kicker', 'Surtitre'],
  ['Lead', 'Chapô'],
  ['Aria', 'Lecteur d’écran'],
];

/** `loadFailed` → « load failed » ; `bank_account` → « bank account ». */
export function wordsOf(segment: string): string {
  return segment
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/[_-]+/gu, ' ')
    .toLocaleLowerCase('fr')
    .trim();
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('fr') + text.slice(1);
}

function labelOfSegment(segment: string): string {
  const known = LABELS[segment];
  if (known !== undefined) {
    return known;
  }
  if (/^\d+$/u.test(segment)) {
    return `Élément ${Number(segment) + 1}`;
  }
  for (const [suffix, role] of ROLE_SUFFIXES) {
    if (segment.endsWith(suffix) && segment.length > suffix.length) {
      return `${role} — ${wordsOf(segment.slice(0, -suffix.length))}`;
    }
  }
  return capitalize(wordsOf(segment));
}

/** Le nom lisible d'une clé, et le groupe sous lequel la ranger. */
export interface CopyName {
  readonly label: string;
  /** Les segments du groupe, sans l'espace ; vide : le texte est à la racine de l'espace. */
  readonly group: string;
}

/** `accueilPublic.hello.kicker` → « Surtitre », groupe `hello`. */
export function copyName(entry: ShopCopyEntryView): CopyName {
  const segments = entry.key.split('.');
  const inner = entry.space !== null && segments[0] === entry.space ? segments.slice(1) : segments;
  const pair = inner.slice(-2).join('.');
  if (inner.length >= 2 && LABELS[pair] !== undefined) {
    return { label: LABELS[pair], group: inner.slice(0, -2).join('.') };
  }
  return {
    label: labelOfSegment(inner.at(-1) ?? entry.key),
    group: inner.slice(0, -1).join('.'),
  };
}

/** L'intertitre d'un groupe : `doors.pickup` → « Doors › pickup ». */
export function groupTitle(group: string): string {
  return capitalize(group.split('.').map(wordsOf).join(' › '));
}

/** Les textes d'un même groupe, dans l'ordre du recueil. */
export interface CopyGroup {
  readonly group: string;
  readonly title: string;
  readonly entries: readonly ShopCopyEntryView[];
}

/** Range les textes par groupe, au premier rencontré ; la racine de l'espace d'abord. */
export function groupEntries(entries: readonly ShopCopyEntryView[]): readonly CopyGroup[] {
  const groups = new Map<string, ShopCopyEntryView[]>([['', []]]);
  for (const entry of entries) {
    const { group } = copyName(entry);
    const list = groups.get(group) ?? [];
    list.push(entry);
    groups.set(group, list);
  }
  return [...groups]
    .filter(([, list]) => list.length > 0)
    .map(([group, list]) => ({
      group,
      title: group === '' ? '' : groupTitle(group),
      entries: list,
    }));
}
