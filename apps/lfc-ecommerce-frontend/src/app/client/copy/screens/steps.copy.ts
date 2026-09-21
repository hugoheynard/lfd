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

  /**
   * 🔴 LES MÊMES TROIS ÉTAPES, DITES À UN PRO (Hugo, 2026-09-20).
   *
   * Ce ne sont pas d'autres étapes : c'est le même parcours, et son ORDRE ne
   * change pas — la réf l'interdit. Ce qui change, c'est ce que chacune promet,
   * parce qu'un pro et un particulier n'attendent pas la même chose du même
   * geste : le premier ARBITRE entre deux acheminements là où le second choisit
   * une maison ; ses horaires de livraison sont négociés là où l'autre prend un
   * créneau ; et son panier est chiffré à son tarif.
   *
   * Trois entrées et non un dictionnaire séparé : deux fichiers finiraient par
   * ne plus avoir le même nombre d'étapes.
   */
  readonly pro: {
    readonly where: StepCopy;
    readonly when: StepCopy;
    readonly what: StepCopy;
  };
}

export const STEPS_FR: StepsCopy = {
  where: { label: 'Où je la prends', hint: 'La maison qui vous arrange' },
  when: { label: 'À quelle heure', hint: 'Les créneaux suivent les fournées' },
  what: { label: 'Ce que j’emporte', hint: 'La boutique est ouverte' },
  doneLabel: 'Étape franchie',
  pro: {
    where: {
      label: 'Je choisis mon acheminement',
      hint: 'Retrait ou coursier, on organise tout',
    },
    /**
     * ⚠️ TENIR SUR UNE LIGNE EST UNE CONTRAINTE DE CETTE PHRASE, pas un hasard
     * de rédaction (Hugo, 2026-09-20). Les trois tuiles se partagent la largeur
     * du rail — environ 358 px à 1440 — et celle qui passe à deux lignes
     * grandit les deux autres avec elle, qui se retrouvent à moitié vides.
     * La version longue disait « horaires de livraison définis selon vos
     * besoins » et débordait ; « vos créneaux » dit la même chose — ce sont
     * les vôtres, donc ils ont été convenus.
     */
    when: {
      label: 'Je choisis l’heure',
      hint: 'Libre au retrait, vos créneaux en livraison',
    },
    what: { label: 'Je compose mon panier', hint: 'Tous les articles à prix pro' },
  },
};

export const STEPS_EN: StepsCopy = {
  where: { label: 'Where I collect', hint: 'The bakery that suits you' },
  when: { label: 'What time', hint: 'Slots follow the bakes' },
  what: { label: 'What I take', hint: 'The shop is open' },
  doneLabel: 'Step completed',
  pro: {
    where: { label: 'I choose how it travels', hint: 'Pickup or courier, we handle it' },
    when: { label: 'I choose the time', hint: 'Free for pickup, your windows for delivery' },
    what: { label: 'I fill my basket', hint: 'Every item at trade prices' },
  },
};

export const STEPS_IT: StepsCopy = {
  where: { label: 'Dove lo ritiro', hint: 'La bottega che vi conviene' },
  when: { label: 'A che ora', hint: 'Gli orari seguono le infornate' },
  what: { label: 'Cosa porto via', hint: 'La bottega è aperta' },
  doneLabel: 'Passo completato',
  pro: {
    where: { label: 'Scelgo il recapito', hint: 'Ritiro o corriere, organizziamo tutto' },
    when: { label: 'Scelgo l’ora', hint: 'Libera al ritiro, i vostri orari in consegna' },
    what: { label: 'Compongo il carrello', hint: 'Tutti gli articoli a prezzo pro' },
  },
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
