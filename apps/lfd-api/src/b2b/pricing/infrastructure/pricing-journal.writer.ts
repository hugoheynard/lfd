import type { PricingAct } from "../domain/pricing-act.js";

/** La ligne du journal, telle qu'elle s'écrit. */
export interface PricingEventRow {
  readonly id: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly act: string;
  readonly actor: string;
  readonly occurredAt: Date;
  readonly reason: string | null;
  readonly summary: string;
}

/**
 * Acte → ligne, écrit une fois pour les deux adaptateurs d'écriture.
 *
 * Ils ont chacun leur table d'état mais partagent ce journal, et deux
 * conversions auraient fini par diverger sur le champ qui compte — l'auteur.
 */
export function eventRow(id: string, act: PricingAct): PricingEventRow {
  return {
    id,
    subjectType: act.subjectType,
    subjectId: act.subjectId,
    act: act.kind,
    actor: act.actor,
    occurredAt: act.at,
    reason: act.reason,
    summary: act.summary,
  };
}
