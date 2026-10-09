import type { ContactLocalizedText } from '@lfd/contracts';
import type { FoldViewToggleOption } from 'fold-ng';

/** Une langue de la boutique. */
export type ContactLang = keyof ContactLocalizedText;

const LANG_LABELS: Readonly<Record<ContactLang, string>> = { fr: 'FR', en: 'EN', it: 'IT' };
const LANG_NAMES: Readonly<Record<ContactLang, string>> = {
  fr: 'français',
  en: 'anglais',
  it: 'italien',
};
export const CONTACT_LANGS: readonly ContactLang[] = ['fr', 'en', 'it'];

/** La langue d'une valeur de bascule — `null` si ce n'en est pas une. */
export function contactLangOf(value: string): ContactLang | null {
  return CONTACT_LANGS.find((lang) => lang === value) ?? null;
}

/**
 * La bascule FR / EN / IT. Une langue où il manque un texte porte un point :
 * `alert` quand le manque bloque (le français d'un objet), `warning` sinon —
 * la boutique y retombera sur le français, ou sur son propre texte.
 *
 * @param missing les langues incomplètes, avec la gravité de chacune.
 */
export function langToggleOptions(
  missing: Partial<Record<ContactLang, 'warning' | 'alert'>>,
): readonly FoldViewToggleOption[] {
  return CONTACT_LANGS.map((lang) => {
    const dot = missing[lang];
    return dot === undefined
      ? { value: lang, label: LANG_LABELS[lang], ariaLabel: LANG_NAMES[lang] }
      : {
          value: lang,
          label: LANG_LABELS[lang],
          ariaLabel: LANG_NAMES[lang],
          dot,
          dotLabel: 'texte manquant',
        };
  });
}

/** Le nom de la langue, dans une phrase (« en anglais »). */
export function langName(lang: ContactLang): string {
  return LANG_NAMES[lang];
}

/**
 * Le texte que la boutique affiche : la langue demandée, sinon le français
 * réglé, sinon le repli — la même règle que `localizedOr` de la boutique
 * (`client/shop/contact-settings.store.ts`, lu le 2026-10-09).
 */
export function localizedOr(
  text: ContactLocalizedText,
  lang: ContactLang,
  fallback: string,
): string {
  const own = text[lang].trim();
  if (own !== '') return own;
  const fr = text.fr.trim();
  return fr === '' ? fallback : fr;
}
