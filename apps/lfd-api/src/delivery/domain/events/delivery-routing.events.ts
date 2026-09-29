import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { AppliedRound } from "../services/apply-proposal.js";
import type { RoutingSettings, RoutingSettingsValues } from "../value-objects/routing-settings.js";
import { citeOrder } from "./delivery-round.events.js";

/**
 * **Les faits du calculateur de tournée** (plan de tournée, lot 7, L7-C13,
 * L7-C14). Les préfixes `delivery_routing.` et `delivery_round.` sont rangés
 * sous `commandes` dans `activity-module.ts`.
 */
export const DELIVERY_ROUTING_FACTS = {
  settingsUpdated: "delivery_routing.settings_updated",
  proposalApplied: "delivery_round.proposal_applied",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Le sujet du réglage : il n'y en a qu'un. */
export const ROUTING_SETTINGS_SUBJECT = "routing";
const ROUTING_SETTINGS_LABEL = "Calcul des tournées";

/**
 * **Les réglages du calcul ont changé.** `before` est `null` quand personne
 * n'avait réglé : le calcul tournait sur ses défauts, et le dire autrement
 * ferait croire qu'on les avait choisis.
 */
export class RoutingSettingsUpdatedEvent implements JournaledEvent {
  constructor(
    readonly settings: RoutingSettings,
    readonly before: RoutingSettingsValues | null,
  ) {}

  journalFact(): JournalFact {
    return {
      type: DELIVERY_ROUTING_FACTS.settingsUpdated,
      subjectType: "delivery_routing",
      subjectId: ROUTING_SETTINGS_SUBJECT,
      payload: {
        subjectLabel: ROUTING_SETTINGS_LABEL,
        before: this.before === null ? null : { ...this.before },
        after: this.settings.values(),
      },
    };
  }
}

/**
 * **Une proposition a été appliquée** (L7-C14) — UN fait pour toute la
 * proposition, dont le sujet est le jour. Chaque tournée touchée dit ses
 * arrêts avant et après ; une tournée que l'application n'a pas changée n'y
 * figure pas.
 */
export class ProposalAppliedEvent implements JournaledEvent {
  constructor(
    readonly day: string,
    readonly rounds: readonly AppliedRound[],
    readonly references: ReadonlyMap<string, string>,
  ) {}

  journalFact(): JournalFact {
    const cite = (orderId: string) => citeOrder(orderId, this.references);
    return {
      type: DELIVERY_ROUTING_FACTS.proposalApplied,
      subjectType: "delivery_day",
      subjectId: this.day,
      payload: {
        subjectLabel: this.day,
        day: this.day,
        rounds: this.rounds.map(({ round, before, opened }) => ({
          round: { id: round.id, name: round.vehicleName },
          passage: round.passage,
          opened,
          before: before.map(cite),
          after: round.orderIds.map(cite),
        })),
      },
    };
  }
}
