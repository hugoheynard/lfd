import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { DeliveryBin } from "../entities/delivery-bin.js";
import type { DeliveryRound } from "../entities/delivery-round.js";
import type { BinLoadRecord, LoadVia, StopLoading } from "../entities/stop-loading.js";
import type { CitedOrder } from "./delivery-round.events.js";

/**
 * **Les faits du chargement** (plan de tournée, lot 4). Le préfixe
 * `delivery_bin.` est rangé sous `commandes` dans `activity-module.ts`, comme
 * la composition. L'acteur n'est pas ici : l'adaptateur du journal le lit dans
 * le contexte de requête.
 */
export const DELIVERY_LOADING_FACTS = {
  declared: "delivery_bin.declared",
  shared: "delivery_bin.shared",
  voided: "delivery_bin.voided",
  loaded: "delivery_bin.loaded",
  unloaded: "delivery_bin.unloaded",
  departed: "delivery_round.departed",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Une fiche staff citée : son nom quand l'annuaire le connaît, son id nu sinon. */
export type CitedStaff = { readonly id: string; readonly name: string } | string;

function binFact(
  type: JournalFactType,
  bin: DeliveryBin,
  extra: Record<string, unknown>,
): JournalFact {
  return {
    type,
    subjectType: "delivery_bin",
    subjectId: bin.id,
    payload: { subjectLabel: bin.code, ...extra },
  };
}

/** La tournée de l'arrêt, citée depuis un bac. */
function roundOf(loading: StopLoading): Record<string, unknown> {
  return {
    round: { id: loading.roundId, name: loading.vehicleName },
    day: loading.serviceDay,
    passage: loading.passage,
  };
}

/** Un type de bac cité : son id et son nom du moment. */
export interface CitedBinType {
  readonly id: string;
  readonly name: string;
}

/** Des bacs d'un type de plus : UN fait, sujet la commande. */
export class DeliveryBinsDeclaredEvent implements JournaledEvent {
  constructor(
    readonly order: { readonly id: string; readonly name: string },
    readonly binType: CitedBinType,
    readonly innerBags: number,
    readonly bins: readonly DeliveryBin[],
  ) {}

  journalFact(): JournalFact {
    return {
      type: DELIVERY_LOADING_FACTS.declared,
      subjectType: "order",
      subjectId: this.order.id,
      payload: {
        subjectLabel: this.order.name,
        binType: this.binType,
        innerBags: this.innerBags,
        bins: this.bins.map((bin) => ({ bin: { id: bin.id, name: bin.code }, half: bin.half })),
      },
    };
  }
}

/** L'autre moitié d'un bac partagé, déclarée pour une commande voisine (v2-4). */
export class DeliveryBinSharedEvent implements JournaledEvent {
  constructor(
    readonly order: { readonly id: string; readonly name: string },
    readonly binType: CitedBinType,
    readonly bin: DeliveryBin,
    readonly partner: DeliveryBin,
    readonly partnerOrder: CitedOrder,
  ) {}

  journalFact(): JournalFact {
    return {
      type: DELIVERY_LOADING_FACTS.shared,
      subjectType: "order",
      subjectId: this.order.id,
      payload: {
        subjectLabel: this.order.name,
        binType: this.binType,
        innerBags: this.bin.innerBags,
        bin: { id: this.bin.id, name: this.bin.code },
        half: this.bin.half,
        partner: { id: this.partner.id, name: this.partner.code },
        partnerOrder: this.partnerOrder,
      },
    };
  }
}

export class DeliveryBinVoidedEvent implements JournaledEvent {
  constructor(
    readonly bin: DeliveryBin,
    readonly order: CitedOrder,
  ) {}

  journalFact(): JournalFact {
    return binFact(DELIVERY_LOADING_FACTS.voided, this.bin, { order: this.order });
  }
}

export class DeliveryBinLoadedEvent implements JournaledEvent {
  constructor(
    readonly bin: DeliveryBin,
    readonly order: CitedOrder,
    readonly loading: StopLoading,
    readonly via: LoadVia,
  ) {}

  journalFact(): JournalFact {
    return binFact(DELIVERY_LOADING_FACTS.loaded, this.bin, {
      order: this.order,
      ...roundOf(this.loading),
      via: this.via,
    });
  }
}

/** Le fait garde qui avait chargé, et quand. */
export class DeliveryBinUnloadedEvent implements JournaledEvent {
  constructor(
    readonly bin: DeliveryBin,
    readonly order: CitedOrder,
    readonly loading: StopLoading,
    readonly previous: BinLoadRecord,
    readonly loadedBy: CitedStaff,
  ) {}

  journalFact(): JournalFact {
    return binFact(DELIVERY_LOADING_FACTS.unloaded, this.bin, {
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
    readonly bins: number,
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
        bins: this.bins,
      },
    };
  }
}
