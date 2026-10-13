import type { DriverTransferStopView } from "@lfd/contracts";

import type {
  TransferOrderContentsReader,
  TransferSitePlacesReader,
} from "../channels/commerce/index.js";
import type { InternalTransfer } from "../domain/entities/internal-transfer.js";
import type { DriverTransferStopRow } from "../domain/ports/driver-rounds.reader.js";
import type { InternalTransfersReader } from "../domain/ports/internal-transfers.reader.js";
import type { TransferBinCounts } from "../domain/ports/transfer-bin-counts.reader.js";
import { itemContentsOf } from "./transfer-contents.js";

/** Les lectures que l'arrêt de transfert du livreur assemble. */
export interface DriverTransferStopSources {
  readonly transfers: InternalTransfersReader;
  readonly contents: TransferOrderContentsReader;
  readonly bins: TransferBinCounts;
  readonly places: TransferSitePlacesReader;
}

const NO_SECTION = { items: [], totals: [] } as const;

/**
 * **Les arrêts de transfert de « Ma tournée »** (plan du transfert interne,
 * lot T2) : le site, les commandes portées, la réception, et ce que l'arrêt
 * transporte — le manifeste figé s'il est parti, calculé sinon. Une lecture
 * du contenu pour tous les transferts encore prévus.
 *
 * Depuis le 2026-10-13 (décisions de Hugo) : le manifeste DÉTAILLÉ, le
 * nombre de bacs et le lieu du site. Les lignes viennent de la tournée déjà
 * lue SOUS LE MUR du livreur : il ne voit que les transferts de sa tournée,
 * sans `delivery_rounds:read`.
 */
export async function driverTransferStopsOf(
  rows: readonly DriverTransferStopRow[],
  sources: DriverTransferStopSources,
): Promise<readonly DriverTransferStopView[]> {
  if (rows.length === 0) {
    return [];
  }
  const loaded = new Map<string, InternalTransfer>();
  for (const row of rows) {
    const transfer = await sources.transfers.byId(row.transferId);
    if (transfer !== null) {
      loaded.set(transfer.id, transfer);
    }
  }
  const unfrozen = [...loaded.values()].filter((transfer) => transfer.departedAt === null);
  const [itemContents, binCounts, places] = await Promise.all([
    itemContentsOf(sources.contents, unfrozen),
    sources.bins.liveBinCounts([...loaded.keys()]),
    sources.places.placesOf([...new Set([...loaded.values()].map((t) => t.siteId))]),
  ]);
  return rows.map((row) => {
    const transfer = loaded.get(row.transferId);
    const manifest = transfer?.manifest(itemContents);
    const place = transfer === undefined ? undefined : places.get(transfer.siteId);
    return {
      stopId: row.stopId,
      transferId: row.transferId,
      position: row.position,
      closedAt: row.closedAt?.toISOString() ?? null,
      siteLabel: row.siteLabel,
      orderCount: row.orderCount,
      receivedAt: row.receivedAt?.toISOString() ?? null,
      totals: manifest?.totals ?? [],
      orders: manifest?.orders ?? NO_SECTION,
      resupplies: manifest?.resupplies ?? NO_SECTION,
      binCount: binCounts.get(row.transferId) ?? 0,
      siteAddress: place?.address ?? null,
      siteGps: place?.gps ?? null,
    };
  });
}
