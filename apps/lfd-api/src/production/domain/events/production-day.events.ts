import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";

/**
 * **Les faits de la journée de production** (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1, tranche (d),
 * 2026-09-19).
 *
 * Arrêter une journée décide ce que le fournil fabrique et fait passer ses
 * commandes `confirmed` chez le commerce ; la reprendre y ajoute ce qui est
 * arrivé depuis. La table le dit (`closed_at`, `retaken_at`/`retaken_by`), mais
 * elle ne garde que le DERNIER retirage et n'a jamais nommé qui avait arrêté la
 * journée. Le journal en est la mémoire.
 *
 * La charge ne recopie pas le plan : le nombre de commandes inscrites suffit à
 * relire le geste, et la fiche de la journée porte le détail.
 *
 * ⚠️ **Ce ne sont PAS les événements du canal.** `ProductionDayClosedEvent`
 * (`channels/commerce/`) est ce que le commerce écoute pour confirmer ses
 * commandes ; il est publié APRÈS la transaction, et aussi à chaque réannonce.
 * Ces faits-ci partent DANS la transaction, et seulement quand quelque chose a
 * changé. Les confondre ferait soit journaliser les réannonces, soit publier au
 * commerce depuis l'intérieur d'une transaction pas encore validée.
 */
export const PRODUCTION_DAY_FACTS = {
  closed: "production_day.closed",
  retaken: "production_day.retaken",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Le sujet : la journée, désignée par sa date de service — sa clé en base. */
const SUBJECT_TYPE = "production_day";

/**
 * La charge d'un fait de journée. Son libellé (D6 du plan des phrases) est la
 * date de service elle-même : une journée n'a pas d'autre nom, et c'est
 * l'écran qui la dit en français.
 */
function dayPayload(serviceDay: string, absorbed: number): Record<string, unknown> {
  return { subjectLabel: serviceDay, serviceDay, absorbed };
}

/** Fait : **la journée est arrêtée** — `absorbed` commandes inscrites au plan. */
export class ProductionDayClosedJournalEvent implements JournaledEvent {
  constructor(
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    readonly absorbed: number,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PRODUCTION_DAY_FACTS.closed,
      subjectType: SUBJECT_TYPE,
      subjectId: this.serviceDay,
      payload: dayPayload(this.serviceDay, this.absorbed),
    };
  }
}

/**
 * Fait : **le tirage est repris** — `absorbed` commandes arrivées depuis sont
 * entrées au plan. Jamais émis à zéro : un retirage qui n'absorbe rien n'écrit
 * rien.
 */
export class ProductionDayRetakenJournalEvent implements JournaledEvent {
  constructor(
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    readonly absorbed: number,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PRODUCTION_DAY_FACTS.retaken,
      subjectType: SUBJECT_TYPE,
      subjectId: this.serviceDay,
      payload: dayPayload(this.serviceDay, this.absorbed),
    };
  }
}
