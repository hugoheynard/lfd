import type { LocaleCode } from '../../client-locale.service';

/**
 * Une étape du parcours : son libellé, et ce qu'elle promet.
 *
 * Les deux sont séparés parce qu'ils ne se lisent pas au même moment — le
 * libellé situe, la promesse décide. Les fondre en une phrase obligerait à
 * choisir entre les deux au premier écran étroit.
 */
export interface StepCopy {
  readonly label: string;
  readonly hint: string;
}

/**
 * **Les trois étapes du parcours public** — où, quand, quoi.
 *
 * 🔴 Elles vivaient dans la copie de l'ACCUEIL, qui était leur seul lecteur.
 * La boutique les affiche désormais aussi, avec les deux premières franchies :
 * les laisser là-bas obligerait un écran à lire la copie d'un autre, ce qui est
 * la façon habituelle dont deux écrans finissent par dire deux choses.
 */
export interface StepsCopy {
  readonly where: StepCopy;
  readonly when: StepCopy;
  readonly what: StepCopy;
  /** Ce qu'annonce une étape FRANCHIE à un lecteur d'écran, faute de chiffre. */
  readonly doneLabel: string;
}

export const STEPS_FR: StepsCopy = {
  where: { label: 'Où je la prends', hint: 'La maison qui vous arrange' },
  when: { label: 'À quelle heure', hint: 'Les créneaux suivent les fournées' },
  what: { label: 'Ce que j’emporte', hint: 'La boutique est ouverte' },
  doneLabel: 'Étape franchie',
};

export const STEPS_EN: StepsCopy = {
  where: { label: 'Where I collect', hint: 'The bakery that suits you' },
  when: { label: 'What time', hint: 'Slots follow the bakes' },
  what: { label: 'What I take', hint: 'The shop is open' },
  doneLabel: 'Step completed',
};

export const STEPS_IT: StepsCopy = {
  where: { label: 'Dove lo ritiro', hint: 'La bottega che vi conviene' },
  when: { label: 'A che ora', hint: 'Gli orari seguono le infornate' },
  what: { label: 'Cosa porto via', hint: 'La bottega è aperta' },
  doneLabel: 'Passo completato',
};

const DICTIONARIES: Readonly<Record<LocaleCode, StepsCopy>> = {
  fr: STEPS_FR,
  en: STEPS_EN,
  it: STEPS_IT,
};

/** Le dictionnaire de la langue choisie. */
export function stepsCopy(locale: LocaleCode): StepsCopy {
  return DICTIONARIES[locale];
}
