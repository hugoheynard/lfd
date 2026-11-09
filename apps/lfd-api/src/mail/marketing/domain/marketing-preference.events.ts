import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";

/**
 * Les faits du registre de préférence vu par le staff (plan
 * `la-desinscription-et-l-accord.md`, lot C4), au journal parmi les
 * autres gestes. Le sujet est la ligne du registre ; l'adresse n'est
 * JAMAIS dans la charge.
 */
export const MARKETING_PREFERENCE_FACTS = {
  recipientRevealed: "mail.preference_recipient_revealed",
  unsubscribedByStaff: "mail.marketing_unsubscribed_by_staff",
  recipientSearched: "mail.preference_recipient_searched",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Le type de sujet des faits du registre. */
const SUBJECT_TYPE = "mail_marketing_preference";

/** **L'adresse d'une ligne du registre est révélée.** L'acteur est celui de la ligne du journal. */
export class MarketingPreferenceRecipientRevealedEvent implements JournaledEvent {
  constructor(
    readonly preferenceId: string,
    readonly space: string,
  ) {}

  journalFact(): JournalFact {
    return {
      type: MARKETING_PREFERENCE_FACTS.recipientRevealed,
      subjectType: SUBJECT_TYPE,
      subjectId: this.preferenceId,
      payload: { space: this.space },
    };
  }
}

/**
 * **Le staff désinscrit une adresse à la demande du client** (règle 8).
 * `changed` : faux si la ligne l'était déjà — le geste est tracé quand même.
 */
export class MarketingUnsubscribedByStaffEvent implements JournaledEvent {
  constructor(
    readonly preferenceId: string,
    readonly space: string,
    readonly changed: boolean,
  ) {}

  journalFact(): JournalFact {
    return {
      type: MARKETING_PREFERENCE_FACTS.unsubscribedByStaff,
      subjectType: SUBJECT_TYPE,
      subjectId: this.preferenceId,
      payload: { space: this.space, changed: this.changed },
    };
  }
}

/**
 * **Le registre est cherché par adresse.** Ni l'adresse ni son empreinte ne
 * vont au journal : le nombre de lignes trouvées suffit à lire le geste.
 */
export class MarketingPreferenceSearchedEvent implements JournaledEvent {
  constructor(
    readonly searchId: string,
    readonly found: number,
  ) {}

  journalFact(): JournalFact {
    return {
      type: MARKETING_PREFERENCE_FACTS.recipientSearched,
      subjectType: "mail_preference_search",
      subjectId: this.searchId,
      payload: { found: this.found },
    };
  }
}
