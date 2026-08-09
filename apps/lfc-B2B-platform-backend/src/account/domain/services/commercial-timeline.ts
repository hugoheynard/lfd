import {
  TIMELINE_OUTCOME_TYPES,
  type CustomerTimelineEntry,
  type TimelineOutcome,
} from "@lfd/contracts";

/**
 * L'**historique commercial** : ce qui s'est joué entre le client et nous, et ce
 * que ça a produit.
 *
 * Un rendez-vous n'a pas de valeur en soi — il en a par ce qui a suivi. Cette
 * fonction rattache donc à chaque rendez-vous **abouti** le premier jalon
 * survenu après lui : le compte s'est activé, il a commandé, il s'est engagé
 * dans la durée. C'est ce qui transforme une liste d'événements en lecture
 * commerciale.
 *
 * Pure, et testée : la règle « le premier jalon dans la fenêtre » est exactement
 * le genre de chose qu'on croit évidente et qu'on écrit de travers.
 */

/** Au-delà, on n'attribue plus : ce qui arrive deux mois après n'est plus « suite à ». */
export const OUTCOME_WINDOW_DAYS = 45;

/** Les interactions dont on cherche une conséquence — celles qui ont eu lieu. */
const CAUSAL_TYPES: readonly string[] = ["appointment.honored", "appointment.confirmed"];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Une entrée brute du journal, avant qu'on lui cherche une suite. */
export interface RawTimelineEntry {
  readonly id: string;
  readonly type: string;
  readonly occurredAt: Date;
  readonly actorType: string;
}

/**
 * Rend l'historique **du plus récent au plus ancien**, chaque rendez-vous
 * portant sa conséquence s'il en a une.
 *
 * Les entrées arrivent dans n'importe quel ordre : on trie ici, une fois, plutôt
 * que de faire confiance à l'appelant.
 */
export function commercialTimeline(entries: readonly RawTimelineEntry[]): CustomerTimelineEntry[] {
  const chronological = [...entries].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );
  const withOutcome = chronological.map((entry) => ({
    id: entry.id,
    type: entry.type,
    occurredAt: entry.occurredAt.toISOString(),
    actorType: entry.actorType,
    outcome: outcomeOf(entry, chronological),
  }));
  return withOutcome.reverse();
}

/**
 * Le premier jalon survenu **après** l'interaction, dans la fenêtre.
 *
 * « Le premier », et non « le plus flatteur » : prendre le meilleur des trois
 * ferait dire à l'historique ce qu'on a envie d'entendre. Un jalon **simultané**
 * ne compte pas non plus — il ne peut pas être la suite de ce qui vient d'avoir
 * lieu.
 */
function outcomeOf(
  entry: RawTimelineEntry,
  chronological: readonly RawTimelineEntry[],
): TimelineOutcome | null {
  if (!CAUSAL_TYPES.includes(entry.type)) {
    return null;
  }
  const limit = entry.occurredAt.getTime() + OUTCOME_WINDOW_DAYS * DAY_MS;
  const milestone = chronological.find(
    (candidate) =>
      TIMELINE_OUTCOME_TYPES.includes(candidate.type) &&
      candidate.occurredAt.getTime() > entry.occurredAt.getTime() &&
      candidate.occurredAt.getTime() <= limit,
  );
  if (milestone === undefined) {
    return null;
  }
  return {
    type: milestone.type,
    days: Math.max(
      0,
      Math.round((milestone.occurredAt.getTime() - entry.occurredAt.getTime()) / DAY_MS),
    ),
  };
}
