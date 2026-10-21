import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { TransferReceptionDesk } from "../../../delivery/channels/handover/index.js";
import { ReceiveTransferByIdAtCounterCommand } from "./receive-transfer-by-id-at-counter.command.js";

/**
 * **« Réceptionner » un transfert par son identifiant** (R3c, R3e) — le
 * comptoir le demande à la livraison par son canal, comme pour une commande.
 * La règle est celle de l'agrégat du transfert ; ce handler ne la redit pas.
 *
 * @throws {InternalTransferNotFoundError} @throws {TransferAlreadyReceivedError}
 * @throws {TransferReceptionReasonRequiredError}
 */
@CommandHandler(ReceiveTransferByIdAtCounterCommand)
export class ReceiveTransferByIdAtCounterHandler implements ICommandHandler<
  ReceiveTransferByIdAtCounterCommand,
  void
> {
  constructor(private readonly desk: TransferReceptionDesk) {}

  async execute(command: ReceiveTransferByIdAtCounterCommand): Promise<void> {
    await this.desk.receiveTransfer({
      transferId: command.transferId,
      staffUserId: command.staffUserId,
      reason: command.reason,
    });
  }
}
