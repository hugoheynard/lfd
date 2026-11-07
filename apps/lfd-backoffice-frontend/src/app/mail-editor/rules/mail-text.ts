import type { ContentLocale, MailCopyLocaleView } from '@lfd/contracts';

import { COPY_LOCALES } from '../../textes-boutique/rules/copy-text';

/**
 * Ce qu'il faut lire d'une langue d'un texte pour dire son état : la vue
 * d'une phrase de l'éditeur (`MailEditorPhraseLocaleView`). Venues de
 * l'ancien écran « Textes des e-mails », retiré le 2026-11-07.
 */
export type MailTextLocaleState = Pick<
  MailCopyLocaleView,
  'default' | 'draftState' | 'draftText' | 'publishedText'
>;

/**
 * Ce que l'e-mail dira après le prochain « Publier » : le brouillon s'il y en
 * a un, le texte du code s'il est rétabli, sinon le publié, sinon le code.
 */
export function upcomingText(view: MailTextLocaleState): string {
  if (view.draftState === 'set') {
    return view.draftText ?? '';
  }
  if (view.draftState === 'reset') {
    return view.default ?? '';
  }
  return view.publishedText ?? view.default ?? '';
}

/** Ce que l'écran dit de l'état d'un texte dans une langue. */
export interface TextState {
  readonly label: string;
  readonly variant: 'warning' | 'success';
}

/** « Brouillon » dès qu'il y a une frappe ou un geste en attente, « Publié » s'il remplace le code. */
export function stateOf(view: MailTextLocaleState, shown: string): TextState | null {
  if (view.draftState !== 'unchanged' || shown !== upcomingText(view)) {
    return { label: 'Brouillon', variant: 'warning' };
  }
  return view.publishedText === null ? null : { label: 'Publié', variant: 'success' };
}

/** Il y a quelque chose à défaire : une frappe, un brouillon, ou un remplacement publié. */
export function canResetTo(view: MailTextLocaleState, shown: string): boolean {
  return (
    shown !== (view.default ?? '') ||
    view.draftState === 'set' ||
    (view.draftState === 'unchanged' && view.publishedText !== null)
  );
}

/** Insère `{name}` à la place de la sélection ; rend le texte et la position du curseur. */
export function insertVariable(
  text: string,
  name: string,
  start: number,
  end: number,
): { readonly text: string; readonly caret: number } {
  const token = `{${name}}`;
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  return { text: text.slice(0, from) + token + text.slice(to), caret: from + token.length };
}

/**
 * Combien de langues portent le signal « le texte d'origine a changé depuis
 * votre modification » (§2 quinquies) — recompté au fil des retouches.
 */
export function defaultChangedIn(
  texts: readonly {
    readonly locales: Readonly<
      Record<ContentLocale, { readonly defaultChangedSince: object | null }>
    >;
  }[],
): number {
  return texts
    .flatMap((text) => COPY_LOCALES.map((locale) => text.locales[locale]))
    .filter((view) => view.defaultChangedSince !== null).length;
}
