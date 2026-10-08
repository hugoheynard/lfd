import type { MandatePaymentType } from "../value-objects/mandate-defaults.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import { localDay } from "./pain008-document.js";

/**
 * **Les valeurs des colonnes F, G et H** du modèle d'import des mandats de la
 * banque (`ModeleImportMandats`, reçu le 2026-10-08) — et nulle part ailleurs.
 *
 * ⚠️ SUPPOSÉES, pas confirmées : la question est posée à la banque
 * (`documentation/comptabilite/prelevement/question-banque.md`, arbitrage A15).
 * Ce module est le SEUL endroit qui les écrit, pour qu'une réponse de la
 * banque se corrige en une ligne. Il ne réutilise pas `sequenceTypeOf` du
 * `pain.008` exprès : si la banque attend autre chose dans son CSV que dans
 * son XML, le XML ne doit pas bouger avec.
 */

/** G — « Sequence de paiement ». Exhaustive : un troisième type ne compile pas. */
const PAYMENT_SEQUENCE: Readonly<Record<MandatePaymentType, string>> = {
  recurrent: "RCUR",
  one_off: "OOFF",
};

/** H — « Nature du prelevement » : le schéma FIGÉ du mandat. */
const DEBIT_NATURE: Readonly<Record<SepaScheme, string>> = {
  CORE: "CORE",
  B2B: "B2B",
};

/**
 * F — « Date de signature » : `JJ/MM/AAAA`, du jour de Paris de la signature,
 * calculé par `localDay` — la fonction de `DtOfSgntr`. Minuit à Paris vaut
 * 22 h ou 23 h UTC la veille : un jour lu en UTC daterait le consentement d'un
 * jour trop tôt, et la banque verrait deux dates pour le même mandat.
 */
export function signatureDateCell(signedAt: Date): string {
  return localDay(signedAt).replace(/^(\d{4})-(\d{2})-(\d{2})$/u, "$3/$2/$1");
}

export function paymentSequenceCell(paymentType: MandatePaymentType): string {
  return PAYMENT_SEQUENCE[paymentType];
}

export function debitNatureCell(scheme: SepaScheme): string {
  return DEBIT_NATURE[scheme];
}
