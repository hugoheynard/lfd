import { cycleToConstitute } from "./billing-cycle.js";

const HOUR_MS = 3_600_000;

/** Où en est l'automatisme d'une entité à un instant donné. */
export interface AutopilotTurn {
  /** La clôture du cycle que l'automatisme constituerait — la clé de sa tentative. */
  readonly cycleClosesAt: Date;
  /** La clôture plus le délai réglé : avant, l'automatisme n'agit pas. */
  readonly plannedConstitutionAt: Date;
  /** L'heure prévue est-elle passée ? */
  readonly due: boolean;
}

/**
 * **Le tour de l'automatisme pour une entité** (plan
 * `plan-prelevement-automatique.md`, PA3) : le cycle qu'on constituerait à
 * `now` — le dernier clos, comme le bouton (`cycleToConstitute`) — et si son
 * heure de constitution prévue (clôture + délai) est passée.
 *
 * Pur : l'instant et le délai sont donnés. La clôture ne dépend pas de la
 * dernière clôture enregistrée, seulement du calendrier : c'est ce qui en
 * fait une clé stable pour « déjà tenté ce cycle ».
 */
export function autopilotTurn(now: Date, autoCollectionDelayHours: number): AutopilotTurn {
  const cycleClosesAt = cycleToConstitute(now, null).closesAt;
  const plannedConstitutionAt = new Date(
    cycleClosesAt.getTime() + autoCollectionDelayHours * HOUR_MS,
  );
  return {
    cycleClosesAt,
    plannedConstitutionAt,
    due: plannedConstitutionAt.getTime() <= now.getTime(),
  };
}
