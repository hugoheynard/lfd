import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";

/**
 * **Les faits des dérogations d'heure limite** (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1, 2026-09-19).
 *
 * Une dérogation laisse passer une commande que la règle refusait, et elle
 * déclenche la surtaxe. La ligne garde son auteur tant qu'elle vit — mais une
 * dérogation retirée est **supprimée** : sans ce journal, « le commercial me
 * l'avait accordée, puis elle a disparu » n'aurait ni date, ni auteur.
 *
 * La charge dit pour qui, pour quel jour, et pourquoi. Le motif y entre : c'est
 * la substance de la décision, et l'écran l'affiche déjà au staff.
 *
 * Le client y est cité avec son nom du moment (D5 du plan des phrases,
 * 2026-09-19), sous `company` ; il l'était par son seul id, sous `companyId`,
 * et les lignes d'avant le gardent. Une dérogation n'a pas de nom à elle : pas
 * de `subjectLabel`, le client et la journée la disent.
 */
export const ORDER_CUTOFF_WAIVER_FACTS = {
  granted: "order_cutoff_waiver.granted",
  revoked: "order_cutoff_waiver.revoked",
} as const satisfies Readonly<Record<string, JournalFactType>>;

const SUBJECT_TYPE = "order_cutoff_waiver";

/** Ce qu'une dérogation décide — relu tel quel au journal. */
export interface CutoffWaiverDecision {
  /** Le client, et le nom sous lequel il se présente CE jour-là (enseigne, ou raison sociale). */
  readonly company: { readonly id: string; readonly name: string };
  /** La journée d'acheminement, `AAAA-MM-JJ` : un jour, jamais un instant. */
  readonly fulfillmentDate: string;
  readonly reason: string;
}

function decisionOf(decision: CutoffWaiverDecision): Record<string, unknown> {
  return {
    company: { id: decision.company.id, name: decision.company.name },
    fulfillmentDate: decision.fulfillmentDate,
    reason: decision.reason,
  };
}

/** Fait : **une dérogation est accordée**. */
export class OrderCutoffWaiverGrantedEvent implements JournaledEvent {
  constructor(
    readonly waiverId: string,
    readonly decision: CutoffWaiverDecision,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ORDER_CUTOFF_WAIVER_FACTS.granted,
      subjectType: SUBJECT_TYPE,
      subjectId: this.waiverId,
      payload: decisionOf(this.decision),
    };
  }
}

/**
 * Fait : **une dérogation qui n'avait pas servi est retirée**. La charge est
 * ce qu'elle décidait — l'avant ; il n'y a pas d'après, la ligne n'est plus.
 */
export class OrderCutoffWaiverRevokedEvent implements JournaledEvent {
  constructor(
    readonly waiverId: string,
    readonly decision: CutoffWaiverDecision,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ORDER_CUTOFF_WAIVER_FACTS.revoked,
      subjectType: SUBJECT_TYPE,
      subjectId: this.waiverId,
      payload: decisionOf(this.decision),
    };
  }
}
