import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { DepartureChoice } from "../entities/departure-choice.js";

export const DEPARTURE_FACTS = {
  chosen: "delivery_departure.chosen",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Le sujet du fait : il n'y a qu'un réglage. */
export const DEPARTURE_SUBJECT = "departure";

/** Un point de retrait cité : nommé s'il existe encore, par son seul id sinon. */
export type CitedPoint = { readonly id: string; readonly name: string } | string;

/**
 * **Le départ des tournées a été choisi.** Le point est cité avec son nom du
 * moment ; le choix remplacé aussi, s'il désigne encore un point de retrait.
 */
export class DepartureChosenEvent implements JournaledEvent {
  constructor(
    readonly choice: DepartureChoice,
    readonly pointLabel: string,
    readonly previous: CitedPoint | null,
  ) {}

  journalFact(): JournalFact {
    return {
      type: DEPARTURE_FACTS.chosen,
      subjectType: "delivery_departure",
      subjectId: DEPARTURE_SUBJECT,
      payload: {
        subjectLabel: this.pointLabel,
        point: { id: this.choice.pickupAddressId, name: this.pointLabel },
        previous: this.previous,
      },
    };
  }
}
