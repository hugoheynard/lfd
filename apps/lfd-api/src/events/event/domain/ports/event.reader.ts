import type { EventDetailView, EventSummaryView } from "@lfd/contracts";

/** La fenêtre de la table, bornes comprises (`AAAA-MM-JJ`). */
export interface EventWindow {
  readonly from: string | null;
  readonly to: string | null;
}

/**
 * Port de **lecture** des événements. Une lecture ne rejoue aucune règle.
 */
export abstract class EventReader {
  /**
   * La table, archivés exclus, **plus proche d'abord** : les événements à venir
   * (à partir de `today`) du plus proche au plus lointain, puis les passés du
   * plus récent au plus ancien.
   */
  abstract list(window: EventWindow, today: string): Promise<readonly EventSummaryView[]>;

  /** Le détail et ses fiches en vigueur, ou `null`. */
  abstract detail(eventId: string): Promise<EventDetailView | null>;
}
