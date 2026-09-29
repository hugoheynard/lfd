import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { DeliveryBag } from "../entities/delivery-bag.js";
import type { DeliveryRound } from "../entities/delivery-round.js";
import type { BagLoadRecord, LoadVia, StopLoading } from "../entities/stop-loading.js";
import type { CitedOrder } from "./delivery-round.events.js";

/**
 * **Les faits du chargement** (plan de tournée, lot 4). Le préfixe
 * `delivery_bag.` est rangé sous `commandes` dans `activity-module.ts`, comme
 * la composition. L'acteur n'est pas ici : l'adaptateur du journal le lit dans
 * le contexte de requête.
 */
export const DELIVERY_LOADING_FACTS = {
  declared: "delivery_bag.declared",
  voided: "delivery_bag.voided",
  loaded: "delivery_bag.loaded",
  unloaded: "delivery_bag.unloaded",
  departed: "delivery_round.departed",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Une fiche staff citée : son nom quand l'annuaire le connaît, son id nu sinon. */
export type CitedStaff = { readonly id: string; readonly name: string } | string;

function bagFact(
  type: JournalFactType,
  bag: DeliveryBag,
  extra: Record<string, unknown>,
): JournalFact {
  return {
    type,
    subjectType: "delivery_bag",
    subjectId: bag.id,
    payload: { subjectLabel: bag.code, ...extra },
  };
}

/** La tournée de l'arrêt, citée depuis un sac. */
function roundOf(loading: StopLoading): Record<string, unknown> {
  return {
    round: { id: loading.roundId, name: loading.vehicleName },
    day: loading.serviceDay,
    passage: loading.passage,
  };
}

/** `count` sacs de plus : UN fait, sujet la commande. */
export class DeliveryBagsDeclaredEvent implements JournaledEvent {
  constructor(
    readonly order: { readonly id: string; readonly name: string },
    readonly bags: readonly DeliveryBag[],
  ) {}

  journalFact(): JournalFact {
    return {
      type: DELIVERY_LOADING_FACTS.declared,
      subjectType: "order",
      subjectId: this.order.id,
      payload: {
        subjectLabel: this.order.name,
        bags: this.bags.map((bag) => ({ id: bag.id, name: bag.code })),
      },
    };
  }
}

export class DeliveryBagVoidedEvent implements JournaledEvent {
  constructor(
    readonly bag: DeliveryBag,
    readonly order: CitedOrder,
  ) {}

  journalFact(): JournalFact {
    return bagFact(DELIVERY_LOADING_FACTS.voided, this.bag, { order: this.order });
  }
}

export class DeliveryBagLoadedEvent implements JournaledEvent {
  constructor(
    readonly bag: DeliveryBag,
    readonly order: CitedOrder,
    readonly loading: StopLoading,
    readonly via: LoadVia,
  ) {}

  journalFact(): JournalFact {
    return bagFact(DELIVERY_LOADING_FACTS.loaded, this.bag, {
      order: this.order,
      ...roundOf(this.loading),
      via: this.via,
    });
  }
}

/** Le fait garde qui avait chargé, et quand. */
export class DeliveryBagUnloadedEvent implements JournaledEvent {
  constructor(
    readonly bag: DeliveryBag,
    readonly order: CitedOrder,
    readonly loading: StopLoading,
    readonly previous: BagLoadRecord,
    readonly loadedBy: CitedStaff,
  ) {}

  journalFact(): JournalFact {
    return bagFact(DELIVERY_LOADING_FACTS.unloaded, this.bag, {
      order: this.order,
      ...roundOf(this.loading),
      loadedAt: this.previous.loadedAt.toISOString(),
      loadedBy: this.loadedBy,
    });
  }
}

export class DeliveryRoundDepartedEvent implements JournaledEvent {
  constructor(
    readonly round: DeliveryRound,
    readonly bags: number,
  ) {}

  journalFact(): JournalFact {
    return {
      type: DELIVERY_LOADING_FACTS.departed,
      subjectType: "delivery_round",
      subjectId: this.round.id,
      payload: {
        subjectLabel: this.round.vehicleName,
        day: this.round.serviceDay,
        passage: this.round.passage,
        stops: this.round.liveStops.length,
        bags: this.bags,
      },
    };
  }
}
