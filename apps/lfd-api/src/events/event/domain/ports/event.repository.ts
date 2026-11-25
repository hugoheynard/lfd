import type { Event } from "../entities/event.js";

/**
 * Port d'**écriture** des événements. Séparé de la lecture (ISP).
 *
 * Il prend et rend l'agrégat, ses fiches comprises : on le charge, on le mute
 * par ses méthodes métier, on le rend.
 */
export abstract class EventRepository {
  /** L'événement et toutes ses fiches (retirées comprises), ou `null`. Archivé compris. */
  abstract load(eventId: string): Promise<Event | null>;

  /** Écrit l'événement et ses fiches : crée ce qui est neuf, met à jour le reste. */
  abstract save(event: Event): Promise<void>;
}
