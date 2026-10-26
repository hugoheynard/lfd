import {
  CONTACT_BOUNDS,
  CONTACT_CARD_DEFAULTS,
  type ContactCardText,
  type ContactLocalizedText,
  type ContactPhoneView,
  type ContactSettingsPayload,
  type CustomerAudience,
} from '@lfd/contracts';

import type { ContactCardPreviewText } from '../contact-card-preview/contact-card-preview';
import { CONTACT_LANGS, localizedOr, type ContactLang } from '../contact-langs';
import { SHOP_CONTACT_BUTTONS } from '../shop-contact-fallback';

/** Les textes d'une carte qu'on saisit, langue par langue. */
export type CardTextPart =
  'kicker' | 'title' | 'body' | 'callLabel' | 'writeLabel' | 'noContactMessage';

/** Les deux interrupteurs d'une carte (décision de Hugo, 2026-10-26). */
export type CardSwitch = 'showPhone' | 'showForm';

const AUDIENCES: readonly CustomerAudience[] = ['b2b', 'b2c'];
const CARD_NAMES: Readonly<Record<CustomerAudience, string>> = {
  b2b: 'Carte pros',
  b2c: 'Carte particuliers',
};

/** Chaque texte, son nom à l'écran et sa borne. */
const PART_BOUNDS: readonly (readonly [CardTextPart, string, number])[] = [
  ['kicker', 'Surtitre trop long', CONTACT_BOUNDS.cardKicker],
  ['title', 'Titre trop long', CONTACT_BOUNDS.cardTitle],
  ['body', 'Phrase trop longue', CONTACT_BOUNDS.cardBody],
  ['callLabel', 'Bouton d’appel trop long', CONTACT_BOUNDS.cardButton],
  ['writeLabel', 'Bouton d’écriture trop long', CONTACT_BOUNDS.cardButton],
  ['noContactMessage', 'Message sans contact trop long', CONTACT_BOUNDS.cardNoContact],
];

/** Une carte qui n'offre ni numéro ni formulaire. */
export function offersNothing(card: ContactCardText): boolean {
  return !card.showPhone && !card.showForm;
}

/**
 * Ce qui empêche l'envoi, en clair — ou `''`. Le domaine refuse la même chose ;
 * le dire avant évite un aller-retour, pas la règle.
 */
export function draftIssue(draft: ContactSettingsPayload): string {
  for (const audience of AUDIENCES) {
    const card = draft.cards[audience];
    for (const [part, sentence, max] of PART_BOUNDS) {
      if (CONTACT_LANGS.some((lang) => card[part][lang].trim().length > max)) {
        return `${CARD_NAMES[audience]} — ${sentence} (${String(max)} caractères au plus).`;
      }
    }
    if (offersNothing(card) && card.noContactMessage.fr.trim() === '') {
      return `${CARD_NAMES[audience]} : une carte sans numéro ni formulaire doit dire quelque chose. Écrivez le message « sans contact » en français, ou réaffichez le numéro ou le formulaire.`;
    }
  }
  return '';
}

const trimmedText = (t: ContactLocalizedText): ContactLocalizedText => ({
  fr: t.fr.trim(),
  en: t.en.trim(),
  it: t.it.trim(),
});

function trimmedCard(c: ContactCardText): ContactCardText {
  return {
    kicker: trimmedText(c.kicker),
    title: trimmedText(c.title),
    body: trimmedText(c.body),
    callLabel: trimmedText(c.callLabel),
    writeLabel: trimmedText(c.writeLabel),
    showPhone: c.showPhone,
    showForm: c.showForm,
    noContactMessage: trimmedText(c.noContactMessage),
  };
}

/** Le réglage tel qu'il part : chaque texte rogné. */
export function trimmedPayload(draft: ContactSettingsPayload): ContactSettingsPayload {
  return { cards: { b2b: trimmedCard(draft.cards.b2b), b2c: trimmedCard(draft.cards.b2c) } };
}

/**
 * La carte telle que la boutique l'affichera, pour une clientèle et une langue :
 * les textes réglés, sinon ceux de la boutique ; aucun numéro inventé
 * (Hugo, 2026-10-26) ; le message quand la carte n'offre rien.
 */
export function previewOf(
  draft: ContactSettingsPayload,
  phones: readonly ContactPhoneView[],
  audience: CustomerAudience,
  lang: ContactLang,
): ContactCardPreviewText {
  const fallback = CONTACT_CARD_DEFAULTS.cards[audience];
  const card = draft.cards[audience];
  const call = localizedOr(card.callLabel, lang, SHOP_CONTACT_BUTTONS.call[lang]);
  const calls = card.showPhone
    ? phones
        .filter((p) => p.active && (p.audience === 'both' || p.audience === audience))
        .sort((a, b) => a.position - b.position)
        .map((p) => `${call} · ${localizedOr(p.label, lang, '')} · ${p.number}`)
    : [];
  return {
    // Pas de repli : sans surtitre réglé, la carte n'en a pas.
    kicker: localizedOr(card.kicker, lang, ''),
    title: localizedOr(card.title, lang, fallback.title[lang]),
    body: localizedOr(card.body, lang, fallback.body[lang]),
    calls,
    write: card.showForm
      ? localizedOr(card.writeLabel, lang, SHOP_CONTACT_BUTTONS.write[lang])
      : '',
    noContact:
      calls.length === 0 && !card.showForm ? localizedOr(card.noContactMessage, lang, '') : '',
  };
}
