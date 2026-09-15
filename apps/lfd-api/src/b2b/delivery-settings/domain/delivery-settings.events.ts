import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { DeliveryOpening, DeliverySettings } from "./delivery-settings.js";

/**
 * **Le fait du réglage de livraison.**
 *
 * Fermer la livraison à une clientèle retire un choix à tous ses clients d'un
 * coup, et la réclamation qui suit demande « depuis quand, et qui ». Le préfixe
 * `delivery_settings.` est rangé sous `commandes` dans `activity-module.ts` :
 * sans lui, le fait n'apparaîtrait dans aucun filtre du journal.
 */
export const DELIVERY_SETTINGS_FACTS = {
  updated: "delivery_settings.updated",
} as const;

/** Le sujet du fait : il n'y a qu'un réglage. */
export const DELIVERY_SETTINGS_SUBJECT = "delivery";

/**
 * La charge dit l'état posé ET l'état remplacé : un patch ne touche qu'une
 * case, et relire « ouvert aux pros » sans savoir ce qui a changé ne répond
 * pas à la question.
 */
export class DeliverySettingsUpdatedEvent implements JournaledEvent {
  constructor(
    readonly settings: DeliverySettings,
    readonly previous: DeliveryOpening,
  ) {}

  journalFact(): JournalFact {
    return {
      type: DELIVERY_SETTINGS_FACTS.updated,
      subjectType: "delivery_settings",
      subjectId: DELIVERY_SETTINGS_SUBJECT,
      payload: {
        openToB2b: this.settings.openToB2b,
        openToB2c: this.settings.openToB2c,
        previous: { openToB2b: this.previous.openToB2b, openToB2c: this.previous.openToB2c },
      },
    };
  }
}
