import type { LocaleCode } from '../../client-locale.service';

/**
 * **Ce que dit le sélecteur de maison public** — l'étape 1 du parcours, rouverte
 * depuis la boutique.
 *
 * ⚠️ Les libellés d'OFFRE (« −20 % sur tout », « Prix boutique ») ne sont pas
 * ici : ils vivent dans `pickupDialog` de `ClientCopy`, et `pickupOffer` en est
 * le lecteur unique. Deux jeux de mots pour la même pastille finiraient par se
 * contredire — c'est arrivé sur un pourcentage le 2026-09-15.
 */
export interface HousePickerCopy {
  /** Le sur-titre : où l'on en est. `{place}` reçoit la maison actuelle. */
  readonly kicker: string;
  readonly title: string;
  readonly lead: string;

  /** Sur la maison déjà retenue — elle reste cliquable, mais se signale. */
  readonly current: string;

  readonly close: string;
}

export const HOUSE_PICKER_FR: HousePickerCopy = {
  kicker: 'Étape 1 sur 3',
  title: 'Où je la prends ?',
  lead: 'Changer de maison change les heures proposées — vous les choisirez juste après.',
  current: 'Votre choix',
  close: 'Fermer',
};

export const HOUSE_PICKER_EN: HousePickerCopy = {
  kicker: 'Step 1 of 3',
  title: 'Where do I collect?',
  lead: 'Changing bakery changes the times on offer — you will pick one right after.',
  current: 'Your choice',
  close: 'Close',
};

export const HOUSE_PICKER_IT: HousePickerCopy = {
  kicker: 'Passo 1 di 3',
  title: 'Dove lo ritiro?',
  lead: 'Cambiare bottega cambia gli orari proposti — li sceglierete subito dopo.',
  current: 'La vostra scelta',
  close: 'Chiudi',
};

const DICTIONARIES: Readonly<Record<LocaleCode, HousePickerCopy>> = {
  fr: HOUSE_PICKER_FR,
  en: HOUSE_PICKER_EN,
  it: HOUSE_PICKER_IT,
};

/** Le dictionnaire de la langue choisie. */
export function housePickerCopy(locale: LocaleCode): HousePickerCopy {
  return DICTIONARIES[locale];
}
