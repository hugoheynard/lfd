import type { ContactLocalizedText } from '@lfd/contracts';

/**
 * **Les mots des boutons de la carte**, pour l'aperçu : la boutique les tient
 * dans son dictionnaire (`accueil-public.copy.ts`, §contact, relu le
 * 2026-10-09) et le back-office ne les règle pas, donc `CONTACT_CARD_DEFAULTS`
 * (`@lfd/contracts`), qui ne porte que le numéro, les titres et les phrases,
 * ne les a pas. Ce qui se règle a son repli là-bas ; ceci n'est que décor.
 */
export const SHOP_CONTACT_BUTTONS: {
  readonly call: ContactLocalizedText;
  readonly write: ContactLocalizedText;
} = {
  call: { fr: 'Appeler', en: 'Call', it: 'Chiamare' },
  write: { fr: 'Écrire', en: 'Write', it: 'Scrivere' },
};
