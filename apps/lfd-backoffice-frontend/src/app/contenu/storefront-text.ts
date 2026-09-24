import type { StorefrontContent, StorefrontText } from '@lfd/contracts';
import { contentLocales } from '@lfd/contracts/content-values';

/** Une langue d'un texte de vitrine : le français est obligatoire, les autres facultatives. */
export type StorefrontLocale = (typeof contentLocales)[number];

export const STOREFRONT_LOCALES = contentLocales;

/** Un contenu info, tel que le contrat le porte. */
export type InfoContent = Extract<StorefrontContent, { kind: 'info' }>;

/**
 * Les longueurs que le serveur tient, champ par champ et dans chaque langue.
 *
 * 🔴 **Recopiées** de `apps/lfd-api/src/b2b/storefront/domain/storefront-text.ts`
 * (`STOREFRONT_TEXT_FIELDS`, lu le 2026-09-24) : le contrat ne les porte pas, et
 * `@lfd/storefront-layout` non plus. Le serveur reste l'autorité — ces bornes ne
 * font que refuser avant d'envoyer. Si elles divergent, c'est le refus du
 * serveur qui s'affichera.
 */
export const TEXT_LIMITS = {
  badge: { label: 'La pastille', max: 30 },
  title: { label: 'Le titre', max: 80 },
  lede: { label: 'La phrase', max: 280 },
  imageAlt: { label: 'Le texte alternatif', max: 200 },
} as const;

export type TextField = keyof typeof TEXT_LIMITS;

/** Le texte d'une langue ; vide si elle n'est pas écrite. */
export function textIn(text: StorefrontText | null, locale: StorefrontLocale): string {
  return text?.[locale] ?? '';
}

/**
 * Écrit une langue. Vider une langue facultative la retire ; un texte
 * facultatif dont plus rien n'est écrit devient `null`. Le français vide est
 * gardé tel quel sur un texte obligatoire : c'est à la vérification de le dire.
 */
export function writeText(
  text: StorefrontText | null,
  locale: StorefrontLocale,
  value: string,
): StorefrontText {
  const base: StorefrontText = text ?? { fr: '' };
  if (locale === 'fr') {
    return { ...base, fr: value };
  }
  const kept = STOREFRONT_LOCALES.filter((other) => other !== 'fr' && other !== locale).flatMap(
    (other) => {
      const written = base[other];
      return written === undefined ? [] : [[other, written] as const];
    },
  );
  return {
    fr: base.fr,
    ...Object.fromEntries(kept),
    ...(value === '' ? {} : { [locale]: value }),
  };
}

/** Un texte facultatif sans aucune langue écrite n'existe pas : `null`. */
export function optionalText(text: StorefrontText): StorefrontText | null {
  return STOREFRONT_LOCALES.some((locale) => textIn(text, locale).trim() !== '') ? text : null;
}

/** Ce qui empêcherait le serveur d'accepter une info, dit pour la personne qui la rédige. */
export function infoIssues(info: InfoContent): readonly string[] {
  const issues: string[] = [];
  if (info.title.fr.trim() === '') {
    issues.push('Le titre en français est obligatoire.');
  }
  const texts: readonly [TextField, StorefrontText | null][] = [
    ['badge', info.badge],
    ['title', info.title],
    ['lede', info.lede],
    ['imageAlt', info.image?.alt ?? null],
  ];
  for (const [field, text] of texts) {
    const limit = TEXT_LIMITS[field];
    if (STOREFRONT_LOCALES.some((locale) => textIn(text, locale).trim().length > limit.max)) {
      issues.push(`${limit.label} tient en ${limit.max} caractères, dans chaque langue.`);
    }
  }
  // Un texte facultatif, s'il existe, porte son français : le serveur le refuse sinon.
  const optional: readonly [TextField, StorefrontText | null][] = [
    ['badge', info.badge],
    ['lede', info.lede],
    ['imageAlt', info.image?.alt ?? null],
  ];
  for (const [field, text] of optional) {
    if (text !== null && text.fr.trim() === '') {
      issues.push(`${TEXT_LIMITS[field].label} a une traduction : écrivez aussi son français.`);
    }
  }
  return issues;
}

/** Une info neuve : un titre à écrire, rien d'autre. */
export function emptyInfo(): InfoContent {
  return {
    kind: 'info',
    badge: null,
    title: { fr: '' },
    lede: null,
    image: null,
    linkShelfKey: null,
  };
}
