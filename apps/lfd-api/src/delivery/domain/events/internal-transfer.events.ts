import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { DeliveryRound } from "../entities/delivery-round.js";
import type { InternalTransfer } from "../entities/internal-transfer.js";

/**
 * **Les faits du transfert interne** (plan du transfert interne, lot T1).
 * Le sujet d'un `internal_transfer.*` est le transfert, nommé par son site ;
 * celui d'un `delivery_round.transfer_stop_*` est la tournée, comme ses
 * voisins de `delivery-round.events.ts`.
 */
export const INTERNAL_TRANSFER_FACTS = {
  opened: "internal_transfer.opened",
  placed: "internal_transfer.placed",
  unplaced: "internal_transfer.unplaced",
  stopMoved: "delivery_round.transfer_stop_moved",
  stopRemoved: "delivery_round.transfer_stop_removed",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Pourquoi un transfert reste sans arrêt (Q-T13). */
export type TransferUnplacedCause = "no_vehicle" | "site_not_located";

function transferFact(
  type: JournalFactType,
  transfer: InternalTransfer,
  extra: Record<string, unknown>,
): JournalFact {
  return {
    type,
    subjectType: "internal_transfer",
    subjectId: transfer.id,
    payload: { subjectLabel: transfer.siteLabel, day: transfer.serviceDay, ...extra },
  };
}

function roundFact(
  type: JournalFactType,
  round: DeliveryRound,
  extra: Record<string, unknown>,
): JournalFact {
  return {
    type,
    subjectType: "delivery_round",
    subjectId: round.id,
    payload: {
      subjectLabel: round.vehicleName,
      day: round.serviceDay,
      passage: round.passage,
      ...extra,
    },
  };
}

function cited(transfer: InternalTransfer): { readonly id: string; readonly name: string } {
  return { id: transfer.id, name: transfer.siteLabel };
}

export class InternalTransferOpenedEvent implements JournaledEvent {
  constructor(readonly transfer: InternalTransfer) {}

  journalFact(): JournalFact {
    return transferFact(INTERNAL_TRANSFER_FACTS.opened, this.transfer, {});
  }
}

export class InternalTransferPlacedEvent implements JournaledEvent {
  constructor(
    readonly transfer: InternalTransfer,
    readonly round: DeliveryRound,
    readonly dedicated: boolean,
  ) {}

  journalFact(): JournalFact {
    return transferFact(INTERNAL_TRANSFER_FACTS.placed, this.transfer, {
      round: { id: this.round.id, name: this.round.vehicleName },
      passage: this.round.passage,
      dedicated: this.dedicated,
    });
  }
}

export class InternalTransferUnplacedEvent implements JournaledEvent {
  constructor(
    readonly transfer: InternalTransfer,
    readonly cause: TransferUnplacedCause,
  ) {}

  journalFact(): JournalFact {
    return transferFact(INTERNAL_TRANSFER_FACTS.unplaced, this.transfer, { cause: this.cause });
  }
}

export class TransferStopMovedEvent implements JournaledEvent {
  constructor(
    readonly from: DeliveryRound,
    readonly to: DeliveryRound,
    readonly transfer: InternalTransfer,
    readonly position: number,
  ) {}

  journalFact(): JournalFact {
    return roundFact(INTERNAL_TRANSFER_FACTS.stopMoved, this.to, {
      transfer: cited(this.transfer),
      from: {
        round: { id: this.from.id, name: this.from.vehicleName },
        passage: this.from.passage,
      },
      position: this.position,
    });
  }
}

export class TransferStopRemovedEvent implements JournaledEvent {
  constructor(
    readonly round: DeliveryRound,
    readonly transfer: InternalTransfer,
  ) {}

  journalFact(): JournalFact {
    return roundFact(INTERNAL_TRANSFER_FACTS.stopRemoved, this.round, {
      transfer: cited(this.transfer),
    });
  }
}
