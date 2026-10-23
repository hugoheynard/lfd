import type { PayerModeSegments } from "../ports/payer-billing-modes.reader.js";
import { DEFAULT_BILLING_MODE, type BillingMode } from "../value-objects/billing-mode.js";
import { PayerTimeline, type ModeTimelines } from "./payer-timeline.js";

/**
 * 🔴 **Combien de clients suivent chaque mode à `now`** — le SEUL compte, lu
 * par le tableau de bord des rythmes ET par la fiche de l'entité, pour qu'ils
 * annoncent le même nombre (Hugo, 2026-10-23).
 *
 * Ne compte que `payerIds` (`countedPayerIdsAt`). Hebdomadaire et deux fois
 * par mois : ceux qui l'ont choisi et chez qui il est EN VIGUEUR (`modeAt`) ;
 * un choix programmé ne compte pas encore. Mensuel : tous les autres, choisi
 * ou par défaut.
 */
export function payerCountsAt(
  modes: ModeTimelines,
  chosen: readonly PayerModeSegments[],
  payerIds: ReadonlySet<string>,
  now: Date,
): ReadonlyMap<BillingMode, number> {
  const inForce = new Map(
    chosen
      .filter((payer) => payerIds.has(payer.payerCompanyId))
      .map((payer) => [payer.payerCompanyId, PayerTimeline.of(payer.segments, modes).modeAt(now)]),
  );
  const counts = new Map<BillingMode, number>();
  for (const current of inForce.values()) {
    if (current.mode !== DEFAULT_BILLING_MODE) {
      counts.set(current.mode, (counts.get(current.mode) ?? 0) + 1);
    }
  }
  const monthly = [...payerIds].filter(
    (id) => (inForce.get(id)?.mode ?? DEFAULT_BILLING_MODE) === DEFAULT_BILLING_MODE,
  ).length;
  return counts.set(DEFAULT_BILLING_MODE, monthly);
}
