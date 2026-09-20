import type { LocaleCode } from '../../client-locale.service';

/**
 * **Ce que dit le récapitulatif de commande** — la maison et l'heure retenues,
 * rappelées au-dessus du rayon.
 *
 * 🔴 Les deux gestes sont SÉPARÉS — « changer de maison » et « changer l'heure »
 * — et ce n'est pas une commodité. Un seul bouton « Modifier » renverrait à
 * l'écran du mode de service, qui repose les deux questions : changer d'heure
 * obligerait à re-choisir la maison. Deux verbes, deux retours.
 */
export interface CommandTermsCopy {
  /** Le sur-titre de la carte : ce dont elle parle. */
  readonly title: string;

  /** Les deux journées qui se disent d'un mot. Cf. `serviceDayLabel`. */
  readonly today: string;
  readonly tomorrow: string;

  readonly changeHouse: string;
  readonly changeTime: string;
}

export const COMMAND_TERMS_FR: CommandTermsCopy = {
  title: 'Ma commande',
  today: 'aujourd’hui',
  tomorrow: 'demain',
  changeHouse: 'Changer de maison',
  changeTime: 'Changer l’heure',
};

export const COMMAND_TERMS_EN: CommandTermsCopy = {
  title: 'My order',
  today: 'today',
  tomorrow: 'tomorrow',
  changeHouse: 'Change bakery',
  changeTime: 'Change time',
};

export const COMMAND_TERMS_IT: CommandTermsCopy = {
  title: 'Il mio ordine',
  today: 'oggi',
  tomorrow: 'domani',
  changeHouse: 'Cambia bottega',
  changeTime: 'Cambia orario',
};

const DICTIONARIES: Readonly<Record<LocaleCode, CommandTermsCopy>> = {
  fr: COMMAND_TERMS_FR,
  en: COMMAND_TERMS_EN,
  it: COMMAND_TERMS_IT,
};

/** Le dictionnaire de la langue choisie. */
export function commandTermsCopy(locale: LocaleCode): CommandTermsCopy {
  return DICTIONARIES[locale];
}
