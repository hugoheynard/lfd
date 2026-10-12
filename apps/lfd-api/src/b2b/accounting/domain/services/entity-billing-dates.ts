import type { PayerModeSegments } from "../ports/payer-billing-modes.reader.js";
import { BILLING_MODES } from "../value-objects/billing-mode.js";
import type { PayerModeSegment, ModeTimelines } from "./payer-timeline.js";

/**
 * **Les dates de facturation d'une entité** (plan
 * `plan-rythme-de-facturation.md`, §16.9, lot M4a) : celles de ses trois
 * modes et les modes que ses payeurs ont choisis. C'est tout ce qu'il faut
 * pour bâtir son `InvoicingCalendar`, et pour savoir si deux entités en
 * service suivent les mêmes suites.
 */
export interface EntityBillingDates {
  readonly modes: ModeTimelines;
  readonly payers: readonly PayerModeSegments[];
}

/**
 * Deux entités aux mêmes dates : mêmes dates pour chaque mode, mêmes payeurs
 * aux mêmes segments. Le relevé ne nomme pas d'entité ; il refuse d'en
 * choisir une quand elles divergent (`SeveralStatementIssuersError`).
 *
 * ⚠️ Comparer TOUS les payeurs est plus strict que nécessaire pour le relevé
 * d'un seul : deux entités qui ne diffèrent que par le mode d'un autre payeur
 * sont refusées aussi. Assumé — une seule entité encaisse (Q4 du plan
 * `lot-de-prelevement-fige.md`), et deux entités en service sont déjà un
 * état que la facture refuse (`NotTheInvoicingEntityError`).
 */
export function sameBillingDates(left: EntityBillingDates, right: EntityBillingDates): boolean {
  return (
    BILLING_MODES.every((mode) => left.modes[mode].equals(right.modes[mode])) &&
    samePayers(left.payers, right.payers)
  );
}

function samePayers(
  left: readonly PayerModeSegments[],
  right: readonly PayerModeSegments[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const byPayer = new Map(right.map((payer) => [payer.payerCompanyId, payer.segments]));
  return left.every((payer) => {
    const twin = byPayer.get(payer.payerCompanyId);
    return twin !== undefined && sameSegments(payer.segments, twin);
  });
}

function sameSegments(
  left: readonly PayerModeSegment[],
  right: readonly PayerModeSegment[],
): boolean {
  const sorted = (segments: readonly PayerModeSegment[]): PayerModeSegment[] =>
    [...segments].sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
  const twins = sorted(right);
  return (
    left.length === right.length &&
    sorted(left).every((segment, index) => {
      const twin = twins[index];
      return (
        twin !== undefined &&
        twin.mode === segment.mode &&
        twin.effectiveFrom.getTime() === segment.effectiveFrom.getTime()
      );
    })
  );
}
