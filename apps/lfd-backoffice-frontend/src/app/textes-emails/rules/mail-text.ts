import type { ContentLocale, MailCopyLocaleView, MailCopyTextView } from '@lfd/contracts';

import { COPY_LOCALES } from '../../textes-boutique/rules/copy-text';

/** Un texte, identifié dans tout l'écran : e-mail, chemin, langue. */
export function textId(mail: string, path: string, locale: ContentLocale): string {
  return `${mail}\u0000${path}\u0000${locale}`;
}

/** Un texte sans sa langue : e-mail et chemin. */
export function textKey(text: Pick<MailCopyTextView, 'mail' | 'path'>): string {
  return `${text.mail}\u0000${text.path}`;
}

/**
 * Ce qu'il faut lire d'une langue d'un texte pour dire son état : la vue de
 * cet écran comme celle de l'éditeur d'e-mails (`MailEditorPhraseLocaleView`,
 * qui partage ces règles au lieu de les recopier).
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

/** Combien de langues de ces textes attendent « Publier ». */
export function pendingIn(texts: readonly MailCopyTextView[]): number {
  return texts
    .flatMap((text) => COPY_LOCALES.map((locale) => text.locales[locale]))
    .filter((view) => view.draftState !== 'unchanged').length;
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
 * votre modification » (§2 quinquies) — recompté au fil des retouches, comme
 * `pendingIn`.
 */
export function defaultChangedIn(texts: readonly MailCopyTextView[]): number {
  return texts
    .flatMap((text) => COPY_LOCALES.map((locale) => text.locales[locale]))
    .filter((view) => view.defaultChangedSince !== null).length;
}
