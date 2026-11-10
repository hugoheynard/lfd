import type { Prisma } from "../../../platform/database/client/client.js";

/** Une ligne de reçu telle qu'elle s'écrit, sans son reçu. */
export interface ReceiptLineColumns {
  readonly sku: string;
  readonly label: string;
  readonly expectedQuantity: number | null;
  readonly quantity: number;
  readonly saleUnit: string;
  readonly position: number;
}

/**
 * Écrit les lignes d'un reçu PAR DIFFÉRENCE avec la base (clé `(receipt_id,
 * sku)`) : supprime les articles retirés, met à jour ceux qui ont changé,
 * insère les nouveaux. Une correction d'un écart ne réécrit qu'une ligne, au
 * lieu de supprimer et recréer tout le reçu à chaque geste (audit du
 * réassort, 2026-11-02). Appelé sous la version du reçu, dans sa transaction.
 */
export async function writeReceiptLines(
  tx: Pick<Prisma.TransactionClient, "resupplyReceiptLine">,
  receiptId: string,
  lines: readonly ReceiptLineColumns[],
): Promise<void> {
  const stored = await tx.resupplyReceiptLine.findMany({
    where: { receiptId },
    select: {
      sku: true,
      label: true,
      expectedQuantity: true,
      quantity: true,
      saleUnit: true,
      position: true,
    },
  });
  const wanted = new Map(lines.map((line) => [line.sku, line]));
  const gone = stored.filter((line) => !wanted.has(line.sku)).map((line) => line.sku);
  if (gone.length > 0) {
    await tx.resupplyReceiptLine.deleteMany({ where: { receiptId, sku: { in: gone } } });
  }
  const before = new Map(stored.map((line) => [line.sku, line]));
  const added = lines.filter((line) => !before.has(line.sku));
  for (const line of lines) {
    const previous = before.get(line.sku);
    if (previous !== undefined && !sameLine(previous, line)) {
      await tx.resupplyReceiptLine.update({
        where: { receiptId_sku: { receiptId, sku: line.sku } },
        data: { ...line },
      });
    }
  }
  if (added.length > 0) {
    await tx.resupplyReceiptLine.createMany({
      data: added.map((line) => ({ receiptId, ...line })),
    });
  }
}

function sameLine(a: ReceiptLineColumns, b: ReceiptLineColumns): boolean {
  return (
    a.label === b.label &&
    a.expectedQuantity === b.expectedQuantity &&
    a.quantity === b.quantity &&
    a.saleUnit === b.saleUnit &&
    a.position === b.position
  );
}
