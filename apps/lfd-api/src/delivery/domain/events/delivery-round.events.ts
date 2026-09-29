import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { DeliveryRound } from "../entities/delivery-round.js";

/**
 * **Les faits de la composition** (plan de tournée, lot 3, C7). Le préfixe
 * `delivery_round.` est rangé sous `commandes` dans `activity-module.ts`, comme
 * la flotte. L'acteur n'est pas ici : l'adaptateur du journal le lit dans le
 * contexte de requête.
 */
export const DELIVERY_ROUND_FACTS = {
  opened: "delivery_round.opened",
  stopAssigned: "delivery_round.stop_assigned",
  stopMoved: "delivery_round.stop_moved",
  stopRemoved: "delivery_round.stop_removed",
  reordered: "delivery_round.reordered",
} as const satisfies Readonly<Record<string, JournalFactType>>;

const SUBJECT_TYPE = "delivery_round";

/**
 * Une commande citée : par son numéro quand le commerce le connaît, par son
 * seul id sinon — le fait ne se perd pas pour un nom manquant, et n'en invente
 * pas.
 */
export type CitedOrder = { readonly id: string; readonly name: string } | string;

/** Nom de la commande `orderId` lu dans `references`, ou son id nu. */
export function citeOrder(orderId: string, references: ReadonlyMap<string, string>): CitedOrder {
  const name = references.get(orderId);
  return name === undefined || name === "" ? orderId : { id: orderId, name };
}

/** Le sujet et la clé d'une tournée : véhicule, jour, passage. */
function roundFact(
  type: JournalFactType,
  round: DeliveryRound,
  extra: Record<string, unknown>,
): JournalFact {
  return {
    type,
    subjectType: SUBJECT_TYPE,
    subjectId: round.id,
    payload: {
      subjectLabel: round.vehicleName,
      day: round.serviceDay,
      passage: round.passage,
      ...extra,
    },
  };
}

export class DeliveryRoundOpenedEvent implements JournaledEvent {
  constructor(readonly round: DeliveryRound) {}

  journalFact(): JournalFact {
    return roundFact(DELIVERY_ROUND_FACTS.opened, this.round, {});
  }
}

export class DeliveryStopAssignedEvent implements JournaledEvent {
  constructor(
    readonly round: DeliveryRound,
    readonly order: { readonly id: string; readonly name: string },
    readonly position: number,
  ) {}

  journalFact(): JournalFact {
    return roundFact(DELIVERY_ROUND_FACTS.stopAssigned, this.round, {
      order: this.order,
      position: this.position,
    });
  }
}

/** UN fait pour un déplacement (C7) : le sujet est la tournée d'arrivée. */
export class DeliveryStopMovedEvent implements JournaledEvent {
  constructor(
    readonly from: DeliveryRound,
    readonly to: DeliveryRound,
    readonly order: CitedOrder,
    readonly position: number,
  ) {}

  journalFact(): JournalFact {
    return roundFact(DELIVERY_ROUND_FACTS.stopMoved, this.to, {
      order: this.order,
      from: {
        round: { id: this.from.id, name: this.from.vehicleName },
        passage: this.from.passage,
      },
      position: this.position,
    });
  }
}

export class DeliveryStopRemovedEvent implements JournaledEvent {
  constructor(
    readonly round: DeliveryRound,
    readonly order: CitedOrder,
  ) {}

  journalFact(): JournalFact {
    return roundFact(DELIVERY_ROUND_FACTS.stopRemoved, this.round, { order: this.order });
  }
}

/** L'ordre avant et après, commandes citées. */
export class DeliveryRoundReorderedEvent implements JournaledEvent {
  constructor(
    readonly round: DeliveryRound,
    readonly before: readonly CitedOrder[],
    readonly after: readonly CitedOrder[],
  ) {}

  journalFact(): JournalFact {
    return roundFact(DELIVERY_ROUND_FACTS.reordered, this.round, {
      before: this.before,
      after: this.after,
    });
  }
}
