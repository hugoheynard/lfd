import type { DurablePublisher } from "../../platform/outbox/durable-publisher.js";
import { TransferReceivedFact } from "../channels/commerce/transfer-received.fact.js";
import type { InternalTransfer } from "../domain/entities/internal-transfer.js";
import { InternalTransferNotFoundError } from "../domain/errors/internal-transfer-errors.js";
import type { InternalTransferRepository } from "../domain/ports/internal-transfer.repository.js";

/** Charge un transfert, ou le refus qui le nomme. @throws {InternalTransferNotFoundError} */
export async function loadTransfer(
  transfers: InternalTransferRepository,
  id: string,
): Promise<InternalTransfer> {
  const transfer = await transfers.load(id);
  if (transfer === null) {
    throw new InternalTransferNotFoundError(id);
  }
  return transfer;
}

/**
 * Le fait durable d'un transfert qui vient d'être reçu (lot R3e) — écrit par
 * les deux chemins de la réception, dans leur transaction.
 */
export async function publishTransferReceived(
  durable: DurablePublisher,
  transfer: InternalTransfer,
): Promise<void> {
  const receipt = transfer.received;
  if (receipt === null) {
    return;
  }
  await durable.publish(
    new TransferReceivedFact(
      transfer.id,
      transfer.siteId,
      transfer.serviceDay,
      receipt.at,
      receipt.by,
      transfer.resupplyIds,
    ).durableFact(),
  );
}
