import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { TransferReceptionDesk } from "../../../delivery/channels/handover/index.js";
import { ReceiveTransferAtCounterCommand } from "./receive-transfer-at-counter.command.js";

/**
 * **« Réceptionner »** (Q-T6, lot T2) — le comptoir demande à la livraison,
 * par le canal qu'elle publie, de recevoir le transfert de la commande. La
 * règle (une réception, motif d'une réception manuelle) est celle de
 * l'agrégat du transfert ; ce handler ne la redit pas.
 *
 * @throws {OrderNotInTransferError} @throws {TransferAlreadyReceivedError}
 * @throws {TransferReceptionReasonRequiredError}
 */
@CommandHandler(ReceiveTransferAtCounterCommand)
export class ReceiveTransferAtCounterHandler implements ICommandHandler<
  ReceiveTransferAtCounterCommand,
  void
> {
  constructor(private readonly desk: TransferReceptionDesk) {}

  async execute(command: ReceiveTransferAtCounterCommand): Promise<void> {
    await this.desk.receiveForOrder({
      orderId: command.orderId,
      staffUserId: command.staffUserId,
      reason: command.reason,
    });
  }
}
