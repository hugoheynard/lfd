import type {
  LocalizedText,
  OperationAudience,
  OperationState,
  OperationView,
} from '@lfd/pim-contracts';
import { httpErrorCode, httpErrorMessage } from '@lfd/endpoints';
import type { FoldBadgeVariant, FoldSelectOption } from 'fold-ng';

/**
 * Ce que l'écran affiche d'une opération : son état en pastille, sa
 * clientèle, et les refus du serveur dits en français.
 *
 * `archived` n'est pas un état du serveur : une opération archivée garde les
 * dates qu'elle avait, et donc un état calculé (`OperationView`). Pour le
 * staff, en revanche, « archivée » passe avant tout le reste — elle ne se
 * modifie plus, quel que soit son calendrier.
 */
export type OperationBadge = OperationState | 'archived';

const BADGES: Readonly<
  Record<OperationBadge, { readonly label: string; readonly variant: FoldBadgeVariant }>
> = {
  preparing: { label: 'En préparation', variant: 'neutral' },
  announced: { label: 'Annoncée', variant: 'info' },
  open: { label: 'Ouverte', variant: 'success' },
  closed: { label: 'Close', variant: 'warning' },
  ended: { label: 'Terminée', variant: 'neutral' },
  archived: { label: 'Archivée', variant: 'neutral' },
};

/** L'état que l'écran montre — celui du serveur, sauf archivage. Jamais recalculé ici (D2). */
export function badgeOf(view: Pick<OperationView, 'state' | 'archivedAt'>): OperationBadge {
  return view.archivedAt === null ? view.state : 'archived';
}

export function badgeLabel(badge: OperationBadge): string {
  return BADGES[badge].label;
}

export function badgeVariant(badge: OperationBadge): FoldBadgeVariant {
  return BADGES[badge].variant;
}

const AUDIENCES: Readonly<Record<OperationAudience, string>> = {
  both: 'Professionnels et particuliers',
  pro: 'Professionnels',
  public: 'Particuliers',
};

/** Les trois clientèles, pour `fold-listbox` (D7). */
export const AUDIENCE_OPTIONS: readonly FoldSelectOption<OperationAudience>[] = (
  ['both', 'pro', 'public'] as const
).map((value) => ({ value, label: AUDIENCES[value] }));

export function audienceLabel(audience: OperationAudience): string {
  return AUDIENCES[audience];
}

/** Un texte en trois langues, tel qu'on le saisit. */
export interface LocalizedDraft {
  readonly fr: string;
  readonly en: string;
  readonly it: string;
}

export const EMPTY_LOCALIZED: LocalizedDraft = { fr: '', en: '', it: '' };

export function localizedDraftOf(text: LocalizedText | null): LocalizedDraft {
  return { fr: text?.fr ?? '', en: text?.en ?? '', it: text?.it ?? '' };
}

/**
 * Le texte à envoyer, ou `null` sans français.
 *
 * Une langue vide est OMISE, pas envoyée vide : le contrat refuse une chaîne
 * vide (`min(1)`), et une traduction absente retombe sur le français côté
 * lecteur — c'est ce que « pas encore traduit » veut dire.
 */
export function localizedOf(draft: LocalizedDraft): LocalizedText | null {
  const fr = draft.fr.trim();
  if (fr === '') {
    return null;
  }
  const en = draft.en.trim();
  const it = draft.it.trim();
  return { fr, ...(en === '' ? {} : { en }), ...(it === '' ? {} : { it }) };
}

/** Deux textes disent-ils la même chose, langue par langue ? L'ordre des clés n'y entre pas. */
export function sameLocalized(a: LocalizedText | null, b: LocalizedText | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.fr === b.fr && a.en === b.en && a.it === b.it;
}

/**
 * Les refus du contexte, dits pour quelqu'un qui n'a pas le code sous les
 * yeux : le cas, puis le geste de sortie.
 *
 * ⚠️ Deux familles de codes ne sont PAS ici, parce que le serveur y cite ce
 * qu'une phrase générique perdrait : l'ordre des dates (`announce_after_order`…
 * nomment les dates en cause, en heure de Paris) et `sku_unknown` (nomme les
 * références). Ils retombent sur le message de l'enveloppe, déjà en français
 * et déjà tourné vers le geste de sortie (`operation-errors.ts`, lu le
 * 2026-09-24).
 */
const REFUSALS: Readonly<Record<string, string>> = {
  'pim.operation.key_invalid':
    "Cette clé n'est pas valable : minuscules sans accent, chiffres et tirets seulement, " +
    '64 caractères au plus (par exemple « noel-2026 »).',
  'pim.operation.key_taken':
    'Cette clé est déjà celle d’une opération, peut-être archivée. Une clé ne se réemploie ' +
    'jamais : choisissez-en une autre.',
  'pim.operation.not_found':
    "Cette opération n'existe pas, ou plus. Revenez à la liste des opérations.",
  'pim.operation.archived':
    'Cette opération est archivée : elle ne se modifie plus. Préparez-en une nouvelle, sous une ' +
    'autre clé.',
  'pim.operation.day_invalid':
    "Un jour de retrait n'existe pas au calendrier. Choisissez-le à nouveau dans le champ.",
  'pim.operation.instant_invalid':
    "Une des dates n'est pas lisible. Choisissez-la à nouveau dans le champ.",
  'pim.operation.audience_invalid':
    "Cette clientèle n'existe pas : professionnels, particuliers ou les deux.",
  'pim.operation.image_invalid':
    "L'image n'a pas d'adresse : choisissez-la dans la médiathèque, ou retirez-la.",
  'pim.operation.sku_duplicate':
    'Un article figure deux fois dans la sélection : gardez-le à une seule place.',
  'pim.operation.selection_too_large':
    'La sélection dépasse ce qu’une opération peut porter. Retirez des articles, ou ' +
    'répartissez-les sur deux opérations.',
  'pim.operation.midnight_missing':
    'La fin des retraits ne se calcule pas pour ce jour. Choisissez un autre dernier jour de ' +
    'retrait, et signalez-le : ce cas ne devrait pas arriver.',
};

/** La phrase d'un refus : la nôtre si le code est connu, sinon celle du serveur. */
export function refusalOf(error: unknown, fallback: string): string {
  const code = httpErrorCode(error);
  const known = code === null ? undefined : REFUSALS[code];
  return known ?? httpErrorMessage(error, fallback);
}
