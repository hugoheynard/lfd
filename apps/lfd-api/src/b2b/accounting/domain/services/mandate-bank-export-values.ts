import type { MandatePaymentType } from "../value-objects/mandate-defaults.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import { localDay } from "./pain008-document.js";

/**
 * **Les valeurs des colonnes F, G, H, K et L** du modèle d'import des mandats
 * de la banque (`modele-import-mandats-cenet-remises.xlsx`) — et nulle part
 * ailleurs.
 *
 * F, G et H sont celles que la banque a DITES le 2026-10-23 (réponse 10 de
 * `documentation/comptabilite/prelevement/reponses-de-la-banque.md`). K et L
 * sont SUPPOSÉES d'après les exemples du modèle, en attente de la question
 * Q-B2 (`documentation/comptabilite/prelevement/prerequis-export-mandats.md`).
 * Ce module est le SEUL endroit qui les écrit, pour qu'une réponse de la
 * banque se corrige en une ligne. Il ne réutilise pas `sequenceTypeOf` du
 * `pain.008` exprès : si la banque attend autre chose dans son CSV que dans
 * son XML, le XML ne doit pas bouger avec.
 */

/** G — « Sequence de paiement ». Exhaustive : un troisième type ne compile pas. */
const PAYMENT_SEQUENCE: Readonly<Record<MandatePaymentType, string>> = {
  recurrent: "RECURRENT",
  one_off: "PONCTUEL",
};

/** H — « Nature du prelevement » : le schéma FIGÉ du mandat. */
const DEBIT_NATURE: Readonly<Record<SepaScheme, string>> = {
  CORE: "CORE",
  B2B: "B2B",
};

/**
 * K — « Mandat déjà émis », obligatoire : `O` pour tous nos mandats, signés
 * chez nous avant l'import. SUPPOSÉ (exemple du modèle), Q-B2.
 */
export const MANDATE_ALREADY_ISSUED_CELL = "O";

/**
 * L — « Mandat migré », obligatoire : `N`, aucun de nos mandats exportés n'est
 * repris d'un autre créancier — ceux-là sont écartés de l'export
 * (`taken_over`). SUPPOSÉ (exemple du modèle), Q-B2.
 */
export const MANDATE_MIGRATED_CELL = "N";

/**
 * F — « Date de signature » : `AAAAMMJJ` (réponse 10, cellule `yyyymmdd` du
 * modèle), du jour de Paris de la signature,
 * calculé par `localDay` — la fonction de `DtOfSgntr`. Minuit à Paris vaut
 * 22 h ou 23 h UTC la veille : un jour lu en UTC daterait le consentement d'un
 * jour trop tôt, et la banque verrait deux dates pour le même mandat.
 */
export function signatureDateCell(signedAt: Date): string {
  return localDay(signedAt).replace(/^(\d{4})-(\d{2})-(\d{2})$/u, "$1$2$3");
}

export function paymentSequenceCell(paymentType: MandatePaymentType): string {
  return PAYMENT_SEQUENCE[paymentType];
}

export function debitNatureCell(scheme: SepaScheme): string {
  return DEBIT_NATURE[scheme];
}
