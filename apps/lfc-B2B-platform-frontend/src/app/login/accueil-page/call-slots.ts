/** Ce qu'un créneau dit de lui-même — la PHRASE, elle, dépend de la langue. */
export type SlotState = 'free' | 'full' | 'oven';

/** Un créneau de rappel proposé par le fournil. */
export interface CallSlot {
  readonly id: string;
  readonly label: string;
  readonly state: SlotState;
}

/** Indisponible : le créneau reste visible, et il dit pourquoi. */
export function isClosed(slot: CallSlot): boolean {
  return slot.state !== 'free';
}

/**
 * Les créneaux d'aujourd'hui. Le 12 h – 14 h n'est pas retiré de la liste : il
 * reste visible et **inerte**, parce qu'un trou dans une grille se lit comme un
 * bug alors qu'un « au four » se lit comme une boulangerie.
 */
export const CALL_SLOTS: readonly CallSlot[] = [
  { id: 'c1', label: '10 h – 11 h', state: 'free' },
  { id: 'c2', label: '11 h – 12 h', state: 'free' },
  { id: 'c3', label: '12 h – 14 h', state: 'oven' },
  { id: 'c4', label: '14 h – 15 h', state: 'free' },
  { id: 'c5', label: '15 h – 16 h', state: 'full' },
  { id: 'c6', label: '16 h – 17 h', state: 'free' },
];
