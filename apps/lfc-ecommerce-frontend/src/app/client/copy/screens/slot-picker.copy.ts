import type { LocaleCode } from '../../client-locale.service';

/**
 * **Ce que dit le sélecteur d'heure public** — l'étape 2 du parcours d'un
 * visiteur (dossier `handoff-bienvenue`, §4).
 *
 * 🔴 Ce qui n'est PAS ici, et pourquoi : la **phrase de fournée** sous chaque
 * heure (« Les viennoiseries sortent à l'instant. Les pains, pas encore. »). La
 * référence en montre une par créneau, et le dossier dit qu'elle vient de
 * `ovenHoursOf(shelfId)` — c'est faux, cette fonction est indexée par RAYON et
 * rend des amplitudes (« entre 6 h et 7 h »). Ces phrases-là n'ont aucune
 * source ; les écrire ici en ferait des promesses de fournée que personne n'a
 * arrêtées.
 *
 * Ce qui a une source, et qui suffit : l'HEURE, et le **badge** que le vendeur
 * saisit par plage en back-office — « Première fournée », « Tout est chaud »
 * sont exactement ce que la maquette montre en pastille.
 */
export interface SlotPickerCopy {
  /** Le sur-titre : où l'on en est, et dans quelle maison. */
  readonly kicker: string;
  readonly title: string;
  readonly lead: string;

  /** Pendant la lecture. Le défaut de fold parle anglais — on ne le laisse pas. */
  readonly loading: string;

  /** Le jour, tel que le panneau l'a pris (2026-10-27 : plus d'onglets). */
  readonly days: {
    readonly today: string;
    readonly tomorrow: string;
    /** Le lien qui renvoie au panneau du jour. */
    readonly change: string;
  };

  /** Ce qu'un créneau fermé dit de lui-même, sous son heure ; un ouvert se tait. */
  readonly state: {
    readonly full: string;
  };

  /** Un créneau complet — visible, fermé, et qui ORIENTE plutôt que de refuser. */
  readonly full: {
    readonly tag: string;
    /** `{time}` = la prochaine heure encore ouverte. */
    readonly nextOpen: string;
    /** Quand il n'y a plus rien d'ouvert après lui. */
    readonly noNext: string;
  };

  /** Rien à proposer ce jour-là : une fermeture, ou un point non réglé. */
  readonly empty: {
    readonly title: string;
    readonly subtitle: string;
  };

  /** Le badge du créneau déjà retenu — le même mot qu'au choix de la maison. */
  readonly current: string;
  readonly close: string;
}

export const SLOT_PICKER_FR: SlotPickerCopy = {
  kicker: 'Retrait · {place}',
  title: 'À quelle heure ?',
  lead: 'Choisissez l’heure qui vous convient.',
  loading: 'Nous regardons les fournées…',
  days: {
    today: 'Aujourd’hui',
    tomorrow: 'Demain',
    change: 'Je change de date',
  },
  state: {
    full: 'Complet',
  },
  full: {
    tag: 'Complet',
    nextOpen: 'Complet — il reste de la place à {time}.',
    noNext: 'Complet — plus rien après cette heure-là.',
  },
  empty: {
    title: 'Aucun créneau ce jour-là',
    subtitle: 'Cette maison ne propose pas de retrait ce jour. Essayez une autre journée.',
  },
  current: 'Votre choix',
  close: 'Fermer',
};

export const SLOT_PICKER_EN: SlotPickerCopy = {
  kicker: 'Pickup · {place}',
  title: 'What time?',
  lead: 'Choose the time that suits you.',
  loading: 'Checking the bakes…',
  days: {
    today: 'Today',
    tomorrow: 'Tomorrow',
    change: 'Change the date',
  },
  state: {
    full: 'Full',
  },
  full: {
    tag: 'Full',
    nextOpen: 'Full — there is room at {time}.',
    noNext: 'Full — nothing left after this one.',
  },
  empty: {
    title: 'No slot that day',
    subtitle: 'This bakery offers no pickup that day. Try another one.',
  },
  current: 'Your choice',
  close: 'Close',
};

export const SLOT_PICKER_IT: SlotPickerCopy = {
  kicker: 'Ritiro · {place}',
  title: 'A che ora?',
  lead: 'Scegliete l’ora che vi conviene.',
  loading: 'Controlliamo le infornate…',
  days: {
    today: 'Oggi',
    tomorrow: 'Domani',
    change: 'Cambio data',
  },
  state: {
    full: 'Esaurito',
  },
  full: {
    tag: 'Esaurito',
    nextOpen: 'Esaurito — c’è ancora posto alle {time}.',
    noNext: 'Esaurito — non resta nulla dopo quest’ora.',
  },
  empty: {
    title: 'Nessun orario quel giorno',
    subtitle: 'Questa bottega non propone il ritiro quel giorno. Provate un’altra giornata.',
  },
  current: 'La vostra scelta',
  close: 'Chiudi',
};

const DICTIONARIES: Readonly<Record<LocaleCode, SlotPickerCopy>> = {
  fr: SLOT_PICKER_FR,
  en: SLOT_PICKER_EN,
  it: SLOT_PICKER_IT,
};

/** Le dictionnaire de la langue choisie. */
export function slotPickerCopy(locale: LocaleCode): SlotPickerCopy {
  return DICTIONARIES[locale];
}
