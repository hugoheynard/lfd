/** Un créneau de rappel proposé par le fournil. */
export interface CallSlot {
  readonly id: string;
  readonly label: string;
  /** Ce que le créneau dit de lui-même : « disponible », « complet », « au four ». */
  readonly sub: string;
  /** Indisponible — et il dit pourquoi plutôt que de disparaître. */
  readonly closed: boolean;
}

/**
 * Les créneaux d'aujourd'hui. Le 12 h – 14 h n'est pas retiré de la liste : il
 * reste visible et **inerte**, parce qu'un trou dans une grille se lit comme un
 * bug alors qu'un « au four » se lit comme une boulangerie.
 */
export const CALL_SLOTS: readonly CallSlot[] = [
  { id: 'c1', label: '10 h – 11 h', sub: 'disponible', closed: false },
  { id: 'c2', label: '11 h – 12 h', sub: 'disponible', closed: false },
  { id: 'c3', label: '12 h – 14 h', sub: 'au four', closed: true },
  { id: 'c4', label: '14 h – 15 h', sub: 'disponible', closed: false },
  { id: 'c5', label: '15 h – 16 h', sub: 'complet', closed: true },
  { id: 'c6', label: '16 h – 17 h', sub: 'disponible', closed: false },
];

/** Le numéro connu du visiteur — maquette, il viendra du compte. */
export const KNOWN_PHONE = '06 12 44 09 87';
