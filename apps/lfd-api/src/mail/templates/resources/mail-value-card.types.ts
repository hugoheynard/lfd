import type { MailsUsingVariable, MailVariableName } from "../copy/mail-copy.variables.js";

/**
 * **La fiche d'une valeur** (plan `plan-editeur-par-blocs.md`, § 24, R1) :
 * ce que la personne qui prépare l'e-mail lit au lieu de `{ref}`. Écrite
 * d'après le gabarit qui la place (`fill`), l'exemple tiré des données
 * d'exemple de l'e-mail (`specimens/`).
 */
export interface MailValueCard {
  readonly label: string;
  readonly description: string;
  readonly example: string;
}

/** Dans cet e-mail, la variable garde le sens de sa fiche par défaut. */
export const SAME_SENSE = "same";

/**
 * Une variable, sa fiche par défaut, et — dès que deux e-mails l'emploient —
 * son sens dans CHACUN d'eux : `SAME_SENSE`, ou une fiche précisée. La table
 * est exhaustive par construction : un e-mail qui se met à employer le nom
 * ne compile plus tant qu'on n'a pas décidé de son sens.
 */
export type MailValueCardEntry<N extends MailVariableName> = MailValueCard & {
  readonly senses?: { readonly [K in MailsUsingVariable<N>]: MailValueCard | typeof SAME_SENSE };
};

/** Une fiche par variable employée — une variable sans fiche ne compile pas. */
export type MailValueCards = { readonly [N in MailVariableName]: MailValueCardEntry<N> };
