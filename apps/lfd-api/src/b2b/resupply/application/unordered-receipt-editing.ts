import type { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import type { Clock } from "../../../platform/time/clock.js";
import type { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import type { ResupplyReceipt } from "../domain/resupply-receipt.js";
import type { ResupplyReceiptRepository } from "../domain/resupply-receipt.repository.js";
import { ReceiptLineNotFoundError } from "../domain/resupply-receipt-errors.js";
import type { ResupplyTrace } from "../domain/resupply-trace.js";
import type { ReceivedStockLowering } from "./received-stock-lowering.js";
import { traceOf } from "./resupply-receipt-trace.js";

/** Ce que corriger ou retirer une ligne du réassort sans commande lit. */
export interface UnorderedReceiptPorts {
  readonly receipts: ResupplyReceiptRepository;
  readonly staff: StaffDirectory;
  readonly clock: Clock;
  readonly uow: UnitOfWork;
  readonly lowering: ReceivedStockLowering;
}

/** L'article visé, dans le réassort sans commande d'un point et d'une journée. */
export interface UnorderedReceiptArticle {
  readonly siteId: string;
  readonly serviceDay: string;
  readonly sku: string;
  readonly staffUserId: string;
}

/**
 * **Une baisse sur le réassort sans commande** — la mécanique commune à
 * « corriger » et « retirer » une ligne, qui se recopiaient à la mutation
 * près (audit du réassort, 2026-11-02) : la trace du geste, l'unité de
 * travail, la garde du déjà-vendu (`ReceivedStockLowering`), le chargement
 * sous le point, puis `save`. La règle elle-même reste dans l'agrégat
 * (`mutate` appelle une méthode de `ResupplyReceipt`).
 *
 * @throws {ReceiptLineNotFoundError} aucun réassort sans commande ce jour-là.
 */
export async function lowerUnorderedReceipt(
  ports: UnorderedReceiptPorts,
  article: UnorderedReceiptArticle,
  mutate: (receipt: ResupplyReceipt, trace: ResupplyTrace) => void,
): Promise<void> {
  const trace = await traceOf(ports.staff, ports.clock, article.staffUserId);
  const { siteId, serviceDay, sku } = article;
  await ports.uow.run(() =>
    ports.lowering.lower({ siteId, serviceDay, sku }, async () => {
      const receipt = await ports.receipts.loadUnordered(siteId, serviceDay);
      if (receipt === null) {
        throw new ReceiptLineNotFoundError(sku);
      }
      mutate(receipt, trace);
      await ports.receipts.save(receipt);
    }),
  );
}
