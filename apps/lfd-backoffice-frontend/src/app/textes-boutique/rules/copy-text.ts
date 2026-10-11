import type { ContentLocale, ShopCopyEntryView, ShopCopyLocaleView } from '@lfd/contracts';

/** Les trois langues, dans l'ordre de l'écran. */
export const COPY_LOCALES: readonly ContentLocale[] = ['fr', 'en', 'it'];

export const LOCALE_LABELS: Readonly<Record<ContentLocale, string>> = {
  fr: 'Français',
  en: 'Anglais',
  it: 'Italien',
};

// La même forme que le domaine de l'API (`replacement-text.ts`, relu le
// 2026-10-11) : le refus à l'écran ne doit pas être plus large ni plus étroit
// que celui du serveur, qui reste l'autorité.
const VARIABLE = /\{(\w+)\}/gu;

/** Les variables qu'un texte porte, sans doublon. */
export function variablesIn(text: string): readonly string[] {
  return [...new Set([...text.matchAll(VARIABLE)].map((match) => match[1] ?? ''))];
}

/** Les variables de la clé que ce texte a perdues — vide : rien de perdu. */
export function missingVariables(text: string, variables: readonly string[]): readonly string[] {
  const present = new Set(variablesIn(text));
  return variables.filter((name) => !present.has(name));
}

/** Un morceau de texte affiché : du texte, ou une variable en pastille. */
export interface TextSegment {
  readonly kind: 'text' | 'variable';
  readonly value: string;
}

/** Découpe un texte pour l'afficher, variables en pastilles. */
export function segmentsOf(text: string): readonly TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(VARIABLE)) {
    const start = match.index;
    if (start > last) {
      segments.push({ kind: 'text', value: text.slice(last, start) });
    }
    segments.push({ kind: 'variable', value: match[1] ?? '' });
    last = start + match[0].length;
  }
  if (last < text.length) {
    segments.push({ kind: 'text', value: text.slice(last) });
  }
  return segments;
}

/**
 * Ce que la boutique dira de ce texte après le prochain Publier : le
 * brouillon s'il y en a un, l'original s'il est remis à zéro, sinon ce qui est
 * publié, sinon l'original.
 */
export function upcomingText(view: ShopCopyLocaleView): string {
  if (view.draftState === 'set') {
    return view.draftText ?? '';
  }
  if (view.draftState === 'reset') {
    return view.original ?? '';
  }
  return view.publishedText ?? view.original ?? '';
}

/** Un texte attend Publier dans au moins une langue. */
export function isPending(entry: ShopCopyEntryView): boolean {
  return COPY_LOCALES.some((locale) => entry.locales[locale].draftState !== 'unchanged');
}

/** La boutique sert autre chose que le texte du code dans au moins une langue. */
export function isModified(entry: ShopCopyEntryView): boolean {
  return COPY_LOCALES.some((locale) => entry.locales[locale].publishedText !== null);
}

/** Une traduction n'a peut-être pas suivi le français (A2). */
export function isStale(entry: ShopCopyEntryView): boolean {
  return entry.staleTranslations.length > 0;
}

/** Les caractères qu'une ligne de champ tient à peu près, à la largeur de la colonne. */
const CHARACTERS_PER_ROW = 60;

/**
 * La hauteur du champ, en lignes, pour que tout le texte se lise sans
 * défiler : une ligne pour un titre court. `fold-textarea` a une hauteur fixe
 * (`rows`, relu le 2026-10-11) — c'est donc le nombre de lignes qui suit le texte.
 */
export function rowsFor(text: string): number {
  return text
    .split('\n')
    .reduce((rows, line) => rows + Math.max(1, Math.ceil(line.length / CHARACTERS_PER_ROW)), 0);
}
