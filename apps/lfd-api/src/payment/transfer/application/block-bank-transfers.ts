import { Injectable } from "@nestjs/common";

import {
  BankTransfers,
  type RecordedTransferView,
  type TransferAllocationView,
  type TransferToRecord,
} from "../../channels/requests/bank-transfers.js";
import {
  type MovementSubject,
  movementSubjectKey,
} from "../../channels/subjects/movement-subject.js";
import { ReceivedTransfer } from "../domain/entities/received-transfer.js";
import { ReceivedTransferRepository } from "../domain/ports/received-transfer.repository.js";
import { RecordedTransfersReader } from "../domain/ports/recorded-transfers.reader.js";
import { TransferAllocationsReader } from "../domain/ports/transfer-allocations.reader.js";

/**
 * **La porte `BankTransfers`, implémentée par le bloc** (plan
 * `documentation/payment/plan-le-virement-recu-dans-payment.md`, §3.1).
 *
 * Aucun appel réseau : `record` juge par l'agrégat puis écrit dans la
 * transaction de l'appelant ; les lectures n'écrivent rien.
 */
@Injectable()
export class BlockBankTransfers extends BankTransfers {
  constructor(
    private readonly transfers: ReceivedTransferRepository,
    private readonly allocations: TransferAllocationsReader,
    private readonly recorded: RecordedTransfersReader,
  ) {
    super();
  }

  async record(transfer: TransferToRecord): Promise<void> {
    await this.transfers.add(ReceivedTransfer.record(transfer));
  }

  async allocationsOf(
    subjects: readonly MovementSubject[],
  ): Promise<ReadonlyMap<string, TransferAllocationView>> {
    if (subjects.length === 0) {
      return new Map();
    }
    const found = await this.allocations.allocationsOf(subjects);
    return new Map(found.map((allocation) => [movementSubjectKey(allocation.subject), allocation]));
  }

  recordedSince(since: Date): Promise<readonly RecordedTransferView[]> {
    return this.recorded.recordedSince(since);
  }
}
