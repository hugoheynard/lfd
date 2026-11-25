import { InvalidEventNameError } from "../errors/event-errors.js";

/** Au-delà, un nom ne tient plus dans une ligne de table ni sur l'intercalaire. */
export const EVENT_NAME_MAX_LENGTH = 200;

/** Le nom d'un événement : ni vide, ni démesuré, sans espaces de bord. */
export class EventName {
  private constructor(readonly value: string) {}

  static of(raw: string): EventName {
    const value = raw.trim();
    if (value.length === 0) {
      throw new InvalidEventNameError("il est vide — donnez un nom à l'événement");
    }
    if (value.length > EVENT_NAME_MAX_LENGTH) {
      throw new InvalidEventNameError(
        `il dépasse ${String(EVENT_NAME_MAX_LENGTH)} caractères — raccourcissez-le`,
      );
    }
    return new EventName(value);
  }
}
