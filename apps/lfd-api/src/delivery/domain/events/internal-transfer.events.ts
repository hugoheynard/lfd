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
  received: "internal_transfer.received",
  orderDetached: "internal_transfer.order_detached",
  orderKept: "internal_transfer.order_kept",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Où le transfert a été reçu (Q-T6) : remis au site par le livreur, ou au comptoir. */
export type TransferReceivedVia = "site_drop" | "counter";

/** Pourquoi une commande quitte son transfert (lot T2, décision 4 de Hugo). */
export type TransferLeaveCause = "cancelled" | "moved";

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

/**
 * Reçu au site (lot T2). `manual` : il n'était parti dans aucune tournée — le
 * motif dit comment la marchandise est venue.
 */
export class InternalTransferReceivedEvent implements JournaledEvent {
  constructor(
    readonly transfer: InternalTransfer,
    readonly via: TransferReceivedVia,
    readonly manual: boolean,
  ) {}

  journalFact(): JournalFact {
    return transferFact(INTERNAL_TRANSFER_FACTS.received, this.transfer, {
      via: this.via,
      manual: this.manual,
      reason: this.transfer.received?.reason ?? null,
    });
  }
}

/** Une commande citée par son numéro — l'identifiant seul quand le commerce ne le rend pas. */
export interface CitedOrder {
  readonly id: string;
  readonly name: string;
}

/** Une commande sortie d'un transfert PRÉVU : annulée, ou changée de jour ou de site. */
export class InternalTransferOrderDetachedEvent implements JournaledEvent {
  constructor(
    readonly transfer: InternalTransfer,
    readonly order: CitedOrder,
    readonly cause: TransferLeaveCause,
  ) {}

  journalFact(): JournalFact {
    return transferFact(INTERNAL_TRANSFER_FACTS.orderDetached, this.transfer, {
      order: this.order,
      cause: this.cause,
    });
  }
}

/**
 * Une commande qui aurait dû sortir d'un transfert DÉJÀ parti ou reçu : rien
 * ne bouge — le manifeste figé fait foi, le transfert ne ramène rien (§3).
 * La ligne dit au bureau qu'une marchandise voyage pour rien.
 */
export class InternalTransferOrderKeptEvent implements JournaledEvent {
  constructor(
    readonly transfer: InternalTransfer,
    readonly order: CitedOrder,
    readonly cause: TransferLeaveCause,
  ) {}

  journalFact(): JournalFact {
    return transferFact(INTERNAL_TRANSFER_FACTS.orderKept, this.transfer, {
      order: this.order,
      cause: this.cause,
      state: this.transfer.status,
    });
  }
}
