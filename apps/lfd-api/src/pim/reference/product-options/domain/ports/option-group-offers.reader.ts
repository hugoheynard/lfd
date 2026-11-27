import type { OptionAudience } from "../value-objects/option-choice.js";

/** Un choix en service, tel qu'un lecteur du référentiel le reçoit. */
export interface OfferedOptionChoice {
  readonly key: string;
  readonly label: string;
  readonly audience: OptionAudience;
}

/** Un groupe tel qu'un lecteur le reçoit : ses seuls choix en service, dans l'ordre. */
export interface OptionGroupOffer {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
  readonly choices: readonly OfferedOptionChoice[];
}

/**
 * **Ce que le référentiel des options sait répondre** — la lecture publiée.
 *
 * La fiche la lit pour refuser l'activation d'un groupe inconnu ou archivé ;
 * le canal la lit pour porter les groupes actifs dans le fait du catalogue.
 * Suit la transaction ambiante : appelée sous l'émetteur, elle voit ce que le
 * geste vient d'écrire.
 */
export abstract class OptionGroupOffers {
  /** Les groupes trouvés parmi `ids`, archivés compris ; un id inconnu n'a pas d'entrée. */
  abstract describe(ids: readonly string[]): Promise<readonly OptionGroupOffer[]>;
}
