import type { MandatePaymentType } from "../value-objects/mandate-defaults.js";

/** La séquence d'un LOT réel : `FRST` et `FNAL` y sont inexprimables. */
export type SequenceType = "RCUR" | "OOFF";

/**
 * La séquence d'un **prélèvement d'essai** (plan `plan-prelevement-d-essai.md`,
 * §4 et Q7, Hugo 2026-10-22) : `FRST` en plus, pour éprouver ce que la banque
 * accepte. `FNAL` reste inexprimable — il peut faire clore la série du mandat.
 */
export type TestSequence = "RCUR" | "FRST" | "OOFF";

/** Toute séquence que le rendu sait écrire dans `SeqTp`. */
export type PaymentSequence = SequenceType | TestSequence;

/**
 * Exhaustive sur `MandatePaymentType` : un troisième type ne compile pas tant
 * qu'il n'a pas sa séquence. `FRST`/`FNAL` décrivent un RANG dans une série, que
 * rien ne mémorise encore.
 */
const SEQUENCE_TYPES: Readonly<Record<MandatePaymentType, SequenceType>> = {
  recurrent: "RCUR",
  one_off: "OOFF",
};

/** L'ordre des blocs `PmtInf` dans un fichier — et donc celui des rangs. */
export const SEQUENCE_ORDER: readonly SequenceType[] = ["RCUR", "OOFF"];

export function sequenceTypeOf(paymentType: MandatePaymentType): SequenceType {
  return SEQUENCE_TYPES[paymentType];
}

/**
 * Relit une séquence rangée : `null` pour toute autre valeur que `RCUR` et
 * `OOFF`. Le lot et le retour l'appellent tous deux (une seule liste, depuis
 * le 2026-10-23) ; à eux de dire ce qu'une valeur inconnue veut dire.
 */
export function sequenceTypeFrom(raw: string): SequenceType | null {
  return SEQUENCE_ORDER.find((sequence) => sequence === raw) ?? null;
}
