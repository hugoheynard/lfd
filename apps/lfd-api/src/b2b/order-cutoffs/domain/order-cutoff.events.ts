import type { OrderCutoffPayload } from "@lfd/contracts";
import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";

/**
 * **Les faits des heures limites de commande.**
 *
 * Une heure limite décide à partir de quand une commande bascule au lendemain.
 * Quand un client réclame — « j'ai commandé à 17 h 02 et vous m'avez livré le
 * surlendemain » — la question est de savoir ce que la règle disait **ce
 * jour-là**, et qui l'avait posée. L'état courant ne le dira pas : il aura
 * peut-être changé depuis, précisément à cause de cette réclamation.
 *
 * La charge porte donc la règle entière : elle tient en cinq champs, et chacun
 * change la réponse.
 *
 * Le point de retrait y est cité avec son nom du moment (D5 du plan des
 * phrases, 2026-09-19), sous `pickupAddress` ; il l'était par son seul id,
 * sous `pickupAddressId`, et les lignes d'avant le gardent. Une règle n'a pas
 * de nom à elle : pas de `subjectLabel`, son contenu la dit.
 */
export const ORDER_CUTOFF_FACTS = {
  created: "order_cutoff.created",
  updated: "order_cutoff.updated",
  removed: "order_cutoff.removed",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/**
 * Le point visé : `null` pour la règle par défaut, `{ id, name }` pour un point
 * connu, l'id seul pour un point que l'annuaire ne connaît plus — une règle
 * ne porte pas de clé étrangère, et le fait ne s'invente pas un nom.
 */
function pickupOf(id: string | null, name: string | null): unknown {
  if (id === null) {
    return null;
  }
  return name === null ? id : { id, name };
}

function ruleOf(payload: OrderCutoffPayload, pickupName: string | null): Record<string, unknown> {
  return {
    // `null` n'est pas une absence ici : c'est « la règle par défaut de la
    // plateforme », et « tous les jours ». Le journal doit pouvoir les relire.
    pickupAddress: pickupOf(payload.pickupAddressId, pickupName),
    weekday: payload.weekday,
    daysBefore: payload.daysBefore,
    time: payload.time,
    // Le rattrapage EN FAIT PARTIE : passer de « limite ferme » à « 45 minutes »
    // change ce que la plateforme accepte, et un journal qui l'omettrait
    // laisserait ce changement-là sans trace.
    graceMinutes: payload.graceMinutes,
  };
}

export class OrderCutoffCreatedEvent implements JournaledEvent {
  constructor(
    readonly cutoffId: string,
    readonly payload: OrderCutoffPayload,
    /** Le nom du point visé au moment du geste ; `null` s'il n'y en a pas, ou s'il est inconnu. */
    readonly pickupName: string | null,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ORDER_CUTOFF_FACTS.created,
      subjectType: "order_cutoff",
      subjectId: this.cutoffId,
      payload: ruleOf(this.payload, this.pickupName),
    };
  }
}

export class OrderCutoffUpdatedEvent implements JournaledEvent {
  constructor(
    readonly cutoffId: string,
    readonly payload: OrderCutoffPayload,
    /** Le nom du point visé au moment du geste ; `null` s'il n'y en a pas, ou s'il est inconnu. */
    readonly pickupName: string | null,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ORDER_CUTOFF_FACTS.updated,
      subjectType: "order_cutoff",
      subjectId: this.cutoffId,
      payload: ruleOf(this.payload, this.pickupName),
    };
  }
}

/**
 * La suppression emporte la règle qu'elle efface — même forme que la
 * création. Elle n'emportait que l'identifiant jusqu'au 2026-09-19, et c'était
 * perdre la réponse à « qu'est-ce que la règle disait ce jour-là » dès qu'on
 * l'avait retirée.
 */
export class OrderCutoffRemovedEvent implements JournaledEvent {
  constructor(
    readonly cutoffId: string,
    /** Ce que la règle décidait, lu avant de la supprimer. */
    readonly rule: OrderCutoffPayload,
    /** Le nom du point visé au moment du retrait ; `null` s'il n'y en a pas, ou s'il est inconnu. */
    readonly pickupName: string | null,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ORDER_CUTOFF_FACTS.removed,
      subjectType: "order_cutoff",
      subjectId: this.cutoffId,
      payload: ruleOf(this.rule, this.pickupName),
    };
  }
}
