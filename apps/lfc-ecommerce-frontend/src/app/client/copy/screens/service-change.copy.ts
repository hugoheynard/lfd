import type { LocaleCode } from '../../client-locale.service';

/**
 * **Ce que dit le panneau « Modifier »** — l'aiguillage vers ce qu'on change
 * d'une commande déjà située (Hugo, 2026-10-27 : « tous les modifier devraient
 * ouvrir un panel de redirection avec retrait/livraison, changer la date,
 * changer l'heure »).
 */
export interface ServiceChangeCopy {
  readonly kicker: string;
  readonly title: string;
  /** Passer du retrait à la livraison. */
  readonly toDelivery: string;
  /** Passer de la livraison au retrait. */
  readonly toPickup: string;
  readonly changeDate: string;
  readonly changeTime: string;
  /** En livraison : l'adresse et son créneau se changent ensemble. */
  readonly changeAddress: string;
  /** Au retrait, quand plusieurs maisons servent. */
  readonly changePlace: string;
  readonly close: string;
}

export const SERVICE_CHANGE_FR: ServiceChangeCopy = {
  kicker: 'Modifier mes choix',
  title: 'Que voulez-vous changer ?',
  toDelivery: 'Me faire livrer',
  toPickup: 'La récupérer en boutique',
  changeDate: 'Changer la date',
  changeTime: 'Changer l’heure',
  changeAddress: 'Changer l’adresse ou le créneau',
  changePlace: 'Changer le point de retrait',
  close: 'Fermer',
};

export const SERVICE_CHANGE_EN: ServiceChangeCopy = {
  kicker: 'Change my choices',
  title: 'What would you like to change?',
  toDelivery: 'Have it delivered',
  toPickup: 'Pick it up in store',
  changeDate: 'Change the date',
  changeTime: 'Change the time',
  changeAddress: 'Change the address or the slot',
  changePlace: 'Change the pickup point',
  close: 'Close',
};

export const SERVICE_CHANGE_IT: ServiceChangeCopy = {
  kicker: 'Modificare le mie scelte',
  title: 'Che cosa volete cambiare?',
  toDelivery: 'Farmelo consegnare',
  toPickup: 'Ritirarlo in negozio',
  changeDate: 'Cambiare la data',
  changeTime: 'Cambiare l’ora',
  changeAddress: 'Cambiare l’indirizzo o la fascia',
  changePlace: 'Cambiare il punto di ritiro',
  close: 'Chiudi',
};

const DICTIONARIES: Readonly<Record<LocaleCode, ServiceChangeCopy>> = {
  fr: SERVICE_CHANGE_FR,
  en: SERVICE_CHANGE_EN,
  it: SERVICE_CHANGE_IT,
};

/** Le dictionnaire de la langue choisie. */
export function serviceChangeCopy(locale: LocaleCode): ServiceChangeCopy {
  return DICTIONARIES[locale];
}
