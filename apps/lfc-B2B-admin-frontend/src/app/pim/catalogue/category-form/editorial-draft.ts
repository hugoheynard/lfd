import { computed, signal, type Signal, type WritableSignal } from '@angular/core';

import {
  LOCALES,
  SOURCE_LOCALE,
  writeLocalized,
  type CategoryEditorialPayload,
  type Locale,
  type LocalizedText,
} from '@lfd/pim-contracts';

/**
 * Les quatre textes d'une famille, dans l'ordre de lecture.
 *
 * Une table et non quatre champs nommés dans l'écran : ajouter un texte se fait
 * ici, et le gabarit itère. La fiche produit en a sept, et sa section les
 * énumère de la même façon.
 */
export const EDITORIAL_FIELDS = [
  { key: 'descriptionShort', label: 'Résumé', long: false },
  { key: 'descriptionLong', label: 'Description', long: true },
  { key: 'seoTitle', label: 'Titre SEO', long: false },
  { key: 'seoDescription', label: 'Description SEO', long: true },
] as const;

export type EditorialField = (typeof EDITORIAL_FIELDS)[number]['key'];

/** `null` = jamais renseigné. Distinct d'un texte vide, qui n'existe pas. */
export type EditorialTexts = Readonly<Record<EditorialField, LocalizedText | null>>;

export const NO_EDITORIAL: EditorialTexts = {
  descriptionShort: null,
  descriptionLong: null,
  seoTitle: null,
  seoDescription: null,
};

/**
 * Les textes en cours de saisie, et la langue qu'on regarde.
 *
 * UNE langue pour les quatre champs, délibérément : on rédige une fiche dans une
 * langue, pas un champ dans une langue et le suivant dans une autre. C'est le
 * même arbitrage que sur la fiche produit.
 */
export interface EditorialDraft {
  readonly texts: WritableSignal<EditorialTexts>;
  readonly locale: WritableSignal<Locale>;
  /** Le texte d'un champ dans la langue affichée — `''` s'il n'y est pas. */
  value(field: EditorialField): string;
  /** Écrit dans la langue affichée, sans toucher aux autres. */
  set(field: EditorialField, value: string): void;
  /** Les langues incomplètes — une langue manque dès qu'UN champ rempli en
   *  français ne l'est pas dans cette langue. */
  readonly missing: Signal<readonly Locale[]>;
  /** La charge à envoyer : les champs vides sont ABSENTS, jamais vides. */
  payload(): CategoryEditorialPayload;
  adopt(source: EditorialTexts | null): void;
}

export function editorialDraft(): EditorialDraft {
  const texts = signal<EditorialTexts>(NO_EDITORIAL);
  const locale = signal<Locale>(SOURCE_LOCALE);

  const missing = computed<readonly Locale[]>(() => {
    const current = texts();
    // Seuls les champs RÉDIGÉS comptent : un champ que personne n'a écrit ne
    // manque dans aucune langue, sinon une famille sans textes s'annoncerait
    // « non traduite » dans les trois.
    const written = EDITORIAL_FIELDS.map((field) => current[field.key]).filter(
      (text): text is LocalizedText => text !== null,
    );
    if (written.length === 0) {
      return [];
    }
    return LOCALES.filter((entry) => written.some((text) => (text[entry] ?? '').trim() === ''));
  });

  return {
    texts,
    locale,
    missing,
    value(field) {
      return texts()[field]?.[locale()] ?? '';
    },
    set(field, value) {
      texts.update((current) => {
        const base = current[field] ?? { [SOURCE_LOCALE]: '' };
        const next = writeLocalized(base, locale(), value);
        // Vider le français efface le champ ENTIER : sans texte source, un champ
        // n'existe pas — c'est aussi ce que le référentiel refuserait.
        const empty = (next[SOURCE_LOCALE] ?? '').trim() === '';
        return { ...current, [field]: empty ? null : next };
      });
    },
    payload() {
      const current = texts();
      const entries = EDITORIAL_FIELDS.flatMap((field) => {
        const text = current[field.key];
        return text === null ? [] : [[field.key, text] as const];
      });
      return Object.fromEntries(entries);
    },
    adopt(source) {
      texts.set(source ?? NO_EDITORIAL);
      locale.set(SOURCE_LOCALE);
    },
  };
}
