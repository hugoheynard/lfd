import { LOCALES, SOURCE_LOCALE, type Locale } from '@lfd/pim-contracts';

/**
 * Les langues, nommées pour un lecteur. Un `Record<Locale, …>` exhaustif : le
 * jour où une locale entre dans le contrat, ce fichier cesse de compiler tant
 * qu'on ne l'a pas nommée — plutôt que d'afficher son code à l'écran.
 */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = {
  fr: 'français',
  en: 'anglais',
  it: 'italien',
};

/**
 * La phrase qui dit ce qui manque — et ce qui est fait.
 *
 * Elle accompagne le point ambre du sélecteur, qui dit « regarde ici » sans dire
 * quoi. Sans elle, il faudrait ouvrir les trois langues pour savoir laquelle
 * pèche. Rien à dire quand tout est traduit : une ligne qui annonce « rien ne
 * manque » est du bruit permanent.
 */
export function missingSentence(subject: string, missing: readonly Locale[]): string | undefined {
  const translated = missing.filter((locale) => locale !== SOURCE_LOCALE);
  if (translated.length === 0) {
    return undefined;
  }
  const named = translated.map((locale) => LOCALE_NAMES[locale]).join(' et ');
  const done = LOCALES.filter((locale) => !translated.some((entry) => entry === locale))
    .map((locale) => LOCALE_NAMES[locale])
    .join(', ');
  return `${subject} en ${named}. Renseigné en ${done}.`;
}
