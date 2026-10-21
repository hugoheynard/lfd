import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../platform/events/domain-event-publisher.js";
import { DurablePublisher } from "../../platform/outbox/durable-publisher.js";
import { Clock } from "../../platform/time/clock.js";
import {
  type TransferIdReceptionRequest,
  TransferReceptionDesk,
  type TransferReceptionRequest,
} from "../channels/handover/index.js";
import { OrderNotInTransferError } from "../domain/errors/internal-transfer-errors.js";
import { InternalTransferReceivedEvent } from "../domain/events/internal-transfer.events.js";
import { InternalTransferRepository } from "../domain/ports/internal-transfer.repository.js";
import { TransferBinCounts } from "../domain/ports/transfer-bin-counts.reader.js";
import type { InternalTransfer } from "../domain/entities/internal-transfer.js";
import { loadTransfer, publishTransferReceived } from "./internal-transfer-support.js";

/**
 * **« Réceptionner » au comptoir du site** (plan du transfert interne, §6.3,
 * Q-T6, lot T2) — l'implémentation, par la livraison, du port qu'elle publie
 * pour le retrait.
 *
 * Deux portes, une règle : par la commande qu'il porte, ou par le transfert
 * lui-même (un transfert de réassort seul, R3c, n'a pas de commande).
 *
 * Dans UNE unité de travail : le transfert est chargé,
 * il refuse ou reçoit (`receive` — manuel depuis `planned`, motif exigé), il
 * est écrit sous `received_at IS NULL`, et le journal le dit — avec le
 * nombre de bacs du transfert (lot T3), ce que le site doit avoir reçu — et
 * le fait durable `delivery.transfer_received` (lot R3e). L'arrêt de
 * transfert, s'il roule encore, reste à clore par le livreur (« Remis au
 * site » sur un transfert déjà reçu ne fait que le clore).
 */
@Injectable()
export class TransferReception extends TransferReceptionDesk {
  constructor(
    private readonly transfers: InternalTransferRepository,
    private readonly bins: TransferBinCounts,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly durable: DurablePublisher,
    private readonly uow: UnitOfWork,
  ) {
    super();
  }

  async receiveForOrder(request: TransferReceptionRequest): Promise<void> {
    await this.uow.run(async () => {
      const holderId = await this.transfers.holderOf({ kind: "order", orderId: request.orderId });
      if (holderId === null) {
        throw new OrderNotInTransferError(request.orderId);
      }
      await this.receiveHeld(holderId, request);
    });
  }

  async receiveTransfer(request: TransferIdReceptionRequest): Promise<void> {
    await this.uow.run(() => this.receiveHeld(request.transferId, request));
  }

  /** Charge, reçoit, écrit, journalise — dans l'unité de travail de l'appelant. */
  private async receiveHeld(
    transferId: string,
    request: { readonly staffUserId: string; readonly reason: string | null },
  ): Promise<void> {
    const transfer = await loadTransfer(this.transfers, transferId);
    const manual = transfer.status === "planned";
    transfer.receive({ at: this.clock.now(), by: request.staffUserId, reason: request.reason });
    await this.transfers.save(transfer);
    await this.events.publishTraced(
      new InternalTransferReceivedEvent(transfer, "counter", manual, await this.binsOf(transfer)),
    );
    await publishTransferReceived(this.durable, transfer);
  }

  /** Les bacs non annulés du transfert, à cet instant. */
  private async binsOf(transfer: InternalTransfer): Promise<number> {
    return (await this.bins.liveBinCounts([transfer.id])).get(transfer.id) ?? 0;
  }
}
