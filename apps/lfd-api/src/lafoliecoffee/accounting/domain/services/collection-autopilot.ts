import type { ClosureSequence } from "./calendar-cycles.js";

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
 * `prelevement-automatique.md`, PA3) : le cycle qu'on constituerait à
 * `now` — le dernier clos, comme le bouton (`entityCycleToConstitute`) — et si son
 * heure de constitution prévue (clôture + délai) est passée.
 *
 * Depuis R4 (plan `plan-rythme-de-facturation.md`, §10), la clôture est la
 * dernière du RYTHME DE L'ENTITÉ atteinte à `now` — le mensuel au 1er rend la
 * clôture d'avant. Une tentative par (entité, clôture) : la table est clée
 * par l'instant depuis PA3. Depuis M3, c'est le CALENDRIER de la facture
 * (`InvoicingCalendar`) : un lundi n'est une clôture que si un payeur y clôt.
 *
 * ## Pas de rattrapage clôture par clôture, à dessein
 *
 * Une clôture manquée (passage arrêté) n'est pas rejouée seule : la
 * constitution ne choisit pas sa clôture, elle prend toujours la dernière, et
 * elle lit les bons depuis le plancher (`collectableOrders(floor, clôture)`)
 * — ceux d'une période manquée entrent donc dans le lot de la suivante. Le
 * délai (≤ 23 h, `AUTO_COLLECTION_DELAY_MAX_HOURS`) est plus court que la
 * plus courte période (une semaine ; un jour entre deux clôtures de modes
 * différents) : la clôture visée est toujours celle
 * dont l'heure prévue vient de passer, ou n'est pas encore venue.
 *
 * Pur : l'instant, le délai et le calendrier sont donnés. La clôture ne dépend
 * pas de la dernière clôture enregistrée, seulement du rythme : c'est ce qui
 * en fait une clé stable pour « déjà tenté ce cycle ».
 */
export function autopilotTurn(
  now: Date,
  autoCollectionDelayHours: number,
  calendar: Pick<ClosureSequence, "lastClosureAtOrBefore">,
): AutopilotTurn {
  const cycleClosesAt = calendar.lastClosureAtOrBefore(now);
  const plannedConstitutionAt = new Date(
    cycleClosesAt.getTime() + autoCollectionDelayHours * HOUR_MS,
  );
  return {
    cycleClosesAt,
    plannedConstitutionAt,
    due: plannedConstitutionAt.getTime() <= now.getTime(),
  };
}
