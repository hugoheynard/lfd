import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../platform/events/domain-event-publisher.js";
import { Clock } from "../../platform/time/clock.js";
import {
  TransferReceptionDesk,
  type TransferReceptionRequest,
} from "../channels/handover/index.js";
import { OrderNotInTransferError } from "../domain/errors/internal-transfer-errors.js";
import { InternalTransferReceivedEvent } from "../domain/events/internal-transfer.events.js";
import { InternalTransferRepository } from "../domain/ports/internal-transfer.repository.js";
import { loadTransfer } from "./internal-transfer-support.js";

/**
 * **« Réceptionner » au comptoir du site** (plan du transfert interne, §6.3,
 * Q-T6, lot T2) — l'implémentation, par la livraison, du port qu'elle publie
 * pour le retrait.
 *
 * Dans UNE unité de travail : le transfert qui porte la commande est chargé,
 * il refuse ou reçoit (`receive` — manuel depuis `planned`, motif exigé), il
 * est écrit sous `received_at IS NULL`, et le journal le dit. L'arrêt de
 * transfert, s'il roule encore, reste à clore par le livreur (« Remis au
 * site » sur un transfert déjà reçu ne fait que le clore).
 */
@Injectable()
export class TransferReception extends TransferReceptionDesk {
  constructor(
    private readonly transfers: InternalTransferRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
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
      const transfer = await loadTransfer(this.transfers, holderId);
      const manual = transfer.status === "planned";
      transfer.receive({ at: this.clock.now(), by: request.staffUserId, reason: request.reason });
      await this.transfers.save(transfer);
      await this.events.publishTraced(
        new InternalTransferReceivedEvent(transfer, "counter", manual),
      );
    });
  }
}
