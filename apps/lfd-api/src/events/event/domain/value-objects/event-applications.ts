import { InvalidEventApplicationsError } from "../errors/event-errors.js";

/**
 * Les applications qu'un événement peut concerner — `lafoliecoffee` seule
 * aujourd'hui. Le `CHECK event_applications_known` de la base admet
 * exactement cette liste : une valeur de plus s'ajoute aux deux.
 */
export const EVENT_APPLICATIONS = ["lafoliecoffee"] as const;
export type EventApplication = (typeof EVENT_APPLICATIONS)[number];

function isKnown(value: string): value is EventApplication {
  return (EVENT_APPLICATIONS as readonly string[]).includes(value);
}

/** La liste, non vide, sans doublon, de valeurs connues. */
export class EventApplications {
  private constructor(readonly values: readonly EventApplication[]) {}

  static of(raw: readonly string[]): EventApplications {
    if (raw.length === 0) {
      throw new InvalidEventApplicationsError("un événement concerne au moins une application");
    }
    const known: EventApplication[] = [];
    for (const value of raw) {
      if (!isKnown(value)) {
        throw new InvalidEventApplicationsError(
          `« ${value} » n'est pas une application connue (${EVENT_APPLICATIONS.join(", ")})`,
        );
      }
      if (!known.includes(value)) {
        known.push(value);
      }
    }
    return new EventApplications(known);
  }

  includes(application: EventApplication): boolean {
    return this.values.includes(application);
  }
}
