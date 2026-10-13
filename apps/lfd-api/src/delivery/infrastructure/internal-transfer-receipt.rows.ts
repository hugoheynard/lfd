import type {
  InternalTransfer,
  InternalTransferState,
  TransferReceipt,
} from "../domain/entities/internal-transfer.js";
import {
  InternalTransferCorruptedError,
  InternalTransferStaleError,
  TransferAlreadyReceivedError,
} from "../domain/errors/internal-transfer-errors.js";
import type { Tx } from "./delivery-round.writes.js";

/**
 * **La réception du transfert, côté lignes** (lot T2) — sortie de
 * `prisma-internal-transfer.repository.ts` pour la taille du fichier.
 */

/** Les colonnes de la réception, telles que la ligne les porte. */
export interface ReceiptRow {
  readonly id: string;
  readonly receivedAt: Date | null;
  readonly receivedBy: string | null;
  readonly receivedReason: string | null;
}

/**
 * La réception s'écrit dans le MÊME `UPDATE` que la version, conditionné par
 * `received_at IS NULL` quand ce geste la pose (§3, S4 du §12.3) : deux
 * comptoirs ensemble, un seul gagne. Le perdant relit pour nommer son refus.
 */
export async function updateTransfer(
  tx: Tx,
  transfer: InternalTransfer,
  snapshot: InternalTransferState,
): Promise<void> {
  const loadedVersion = transfer.loadedVersion ?? 0;
  const receiving = snapshot.received !== null && snapshot.received !== undefined;
  const written = await tx.deliveryInternalTransfer.updateMany({
    where: {
      id: snapshot.id,
      version: loadedVersion,
      ...(receiving ? { OR: [{ receivedAt: null }, { receivedAt: snapshot.received?.at }] } : {}),
    },
    data: {
      departedAt: snapshot.departedAt,
      ...receivedColumns(snapshot.received ?? null),
      version: snapshot.version,
      updatedAt: snapshot.updatedAt,
    },
  });
  if (written.count > 0) {
    return;
  }
  const current = await tx.deliveryInternalTransfer.findUnique({
    where: { id: snapshot.id },
    select: { receivedAt: true },
  });
  if (receiving && current !== null && current.receivedAt !== null) {
    throw new TransferAlreadyReceivedError(snapshot.siteLabel);
  }
  throw new InternalTransferStaleError(snapshot.siteLabel);
}

export function receivedColumns(receipt: TransferReceipt | null): {
  readonly receivedAt: Date | null;
  readonly receivedBy: string | null;
  readonly receivedReason: string | null;
} {
  return {
    receivedAt: receipt?.at ?? null,
    receivedBy: receipt?.by ?? null,
    receivedReason: receipt?.reason ?? null,
  };
}

/** @throws {InternalTransferCorruptedError} une réception sans auteur. */
export function receiptOfRow(row: ReceiptRow): TransferReceipt | null {
  if (row.receivedAt === null) {
    return null;
  }
  if (row.receivedBy === null) {
    throw new InternalTransferCorruptedError(row.id, "une réception sans auteur");
  }
  return { at: row.receivedAt, by: row.receivedBy, reason: row.receivedReason };
}
