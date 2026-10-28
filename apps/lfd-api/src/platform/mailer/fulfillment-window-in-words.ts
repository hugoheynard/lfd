import type { FulfillmentWindow } from "@lfd/contracts";

import { fill } from "./copy/mail-copy.js";

/** Les deux tournures d'un créneau, telles que chaque e-mail les porte dans son dictionnaire. */
export interface WindowWording {
  /** `{start}`, `{end}` — « entre 07:00 et 09:00 ». */
  readonly windowBetween: string;
  /** `{end}` — « avant 08:00 ». */
  readonly windowBefore: string;
}

/**
 * Le créneau d'une commande en mots — la confirmation et le départ en
 * livraison le disent de la même façon. `null` quand la commande n'en a pas.
 */
export function windowInWords(
  window: FulfillmentWindow | null,
  wording: WindowWording,
): string | null {
  if (window === null) {
    return null;
  }
  return window.start === null
    ? fill(wording.windowBefore, { end: window.end })
    : fill(wording.windowBetween, { start: window.start, end: window.end });
}
