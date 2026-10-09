import { CONTACT_MIN_FILL_MS } from "@lfd/contracts";

/** Ce que le formulaire dit de sa saisie, au-delà du message. */
export interface ContactFormSignals {
  /** Le champ piège : invisible à l'écran, un humain le laisse vide. */
  readonly website: string;
  /** Le temps écoulé depuis l'ouverture du dialogue, en millisecondes. */
  readonly elapsedMs: number;
}

/**
 * **Le formulaire a-t-il été rempli par un robot ?** (`plan-nous-ecrire.md`,
 * §2.2 et §5.2.) Piège rempli, ou saisie plus rapide que `CONTACT_MIN_FILL_MS`.
 *
 * Ce n'est pas une preuve, c'est un tri : un robot qui attend et laisse le
 * champ vide passe, et c'est le débit par IP qui le borne ensuite.
 */
export function looksAutomated(signals: ContactFormSignals): boolean {
  return signals.website.trim() !== "" || signals.elapsedMs < CONTACT_MIN_FILL_MS;
}
