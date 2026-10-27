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

  /**
   * `{hour}` — l'heure d'OUVERTURE publique déclarée du point.
   *
   * 🔴 La maquette écrit « Prêt dès 6 h 30 · 4 min à pied du téléphérique ».
   * La seconde moitié n'a AUCUNE source — rien dans le système ne porte un
   * temps d'accès — et la première en a une : `publicOpening.start`, que
   * l'accueil affiche déjà sous le nom qui lui revient. On n'écrit donc que
   * celle-là, et la ligne DISPARAÎT pour un point qui ne déclare pas
   * d'ouverture publique.
   */
  readonly readyFrom: string;

  readonly close: string;
}

export const HOUSE_PICKER_FR: HousePickerCopy = {
  kicker: 'Le point de retrait',
  title: 'Où je la prends ?',
  lead: 'Changer de maison change les heures proposées — vous les choisirez juste après.',
  current: 'Votre choix',
  readyFrom: 'Prêt dès {hour}',
  close: 'Fermer',
};

export const HOUSE_PICKER_EN: HousePickerCopy = {
  kicker: 'The pickup point',
  title: 'Where do I collect?',
  lead: 'Changing bakery changes the times on offer — you will pick one right after.',
  current: 'Your choice',
  readyFrom: 'Ready from {hour}',
  close: 'Close',
};

export const HOUSE_PICKER_IT: HousePickerCopy = {
  kicker: 'Il punto di ritiro',
  title: 'Dove lo ritiro?',
  lead: 'Cambiare bottega cambia gli orari proposti — li sceglierete subito dopo.',
  current: 'La vostra scelta',
  readyFrom: 'Pronto dalle {hour}',
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
