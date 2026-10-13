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
