import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import { SITE_FACTS, SUBJECT_TYPE } from "./site.events.js";

/**
 * **Les faits de la grille de tables** (Hugo, 2026-10-17, plan
 * `documentation/sites/plan-sur-place-capacite-de-site.md`, L2).
 *
 * Le sujet reste le site (`pickup_address`). Ils portent le NUMÉRO de table,
 * jamais le jeton : il vaut accès à la table, et un journal se relit plus
 * largement que la grille.
 */

/** Le nombre de tables a changé ; celles retirées ont perdu leur QR. */
export class SiteTablesSetEvent implements JournaledEvent {
  constructor(
    readonly siteId: string,
    readonly label: string,
    readonly before: number,
    readonly count: number,
  ) {}

  journalFact(): JournalFact {
    return {
      type: SITE_FACTS.tablesSet,
      subjectType: SUBJECT_TYPE,
      subjectId: this.siteId,
      payload: { subjectLabel: this.label, count: this.count, before: this.before },
    };
  }
}

/** Le QR d'une table a été (re)généré : l'ancien code imprimé ne vaut plus. */
export class SiteTableQrGeneratedEvent implements JournaledEvent {
  constructor(
    readonly siteId: string,
    readonly label: string,
    readonly table: number,
  ) {}

  journalFact(): JournalFact {
    return {
      type: SITE_FACTS.tableQrGenerated,
      subjectType: SUBJECT_TYPE,
      subjectId: this.siteId,
      payload: { subjectLabel: this.label, table: this.table },
    };
  }
}

/** Le QR d'une table a été retiré. */
export class SiteTableQrRemovedEvent implements JournaledEvent {
  constructor(
    readonly siteId: string,
    readonly label: string,
    readonly table: number,
  ) {}

  journalFact(): JournalFact {
    return {
      type: SITE_FACTS.tableQrRemoved,
      subjectType: SUBJECT_TYPE,
      subjectId: this.siteId,
      payload: { subjectLabel: this.label, table: this.table },
    };
  }
}
