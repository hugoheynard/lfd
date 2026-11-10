import { BILLING_MODES, type BillingMode } from "../value-objects/billing-mode.js";

/** Ce qui décide des rythmes d'une procédure. */
export interface ProcedureRhythmsInput {
  /** Les rythmes que le calendrier clôt ce jour-là (`modesClosingAt`). */
  readonly closureModes: readonly BillingMode[];
  /** Les rythmes des clients de ses lots ; `null` : aucun lot. */
  readonly lotModes: readonly BillingMode[] | null;
  /** Les clients comptés par rythme (`payerCountsAt`) — ceux des barres du tableau de bord. */
  readonly payerCounts: ReadonlyMap<BillingMode, number>;
}

/**
 * 🔴 **Les rythmes d'une procédure de prélèvement** — ceux qui font son code
 * (`PRL-<AAMMJJ>-<rythmes>`) et la disent « mutualisée » (Hugo, 2026-10-23,
 * doc `procedure-de-prelevement.md` § 4 bis). Un rythme ne compte QUE s'il a
 * au moins un client :
 *
 * - un lot existe : les rythmes des clients DU LOT (`lotPayerModes`) ;
 * - sinon : ceux que le calendrier clôt ce jour-là ET qui ont un client compté
 *   — le lundi 1er sans client mensuel est `-H`, pas `-HM`.
 *
 * Aucun rythme avec client : liste vide, code sans lettre, jamais mutualisée.
 * La SEULE règle : liste, détail, calendrier et noms de fichiers la lisent.
 */
export function procedureRhythms(input: ProcedureRhythmsInput): readonly BillingMode[] {
  const chosen =
    input.lotModes ?? input.closureModes.filter((mode) => (input.payerCounts.get(mode) ?? 0) > 0);
  return BILLING_MODES.filter((mode) => chosen.includes(mode));
}
