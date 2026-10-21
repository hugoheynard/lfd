import type { DriverTransferStopView } from "@lfd/contracts";

import type {
  TransferOrderContentsReader,
  TransferSitePlacesReader,
} from "../channels/commerce/index.js";
import type { InternalTransfer } from "../domain/entities/internal-transfer.js";
import type { DriverTransferStopRow } from "../domain/ports/driver-rounds.reader.js";
import type { InternalTransfersReader } from "../domain/ports/internal-transfers.reader.js";
import type { TransferBinCounts } from "../domain/ports/transfer-bin-counts.reader.js";
import { transferClientelesOf, withClienteles } from "./transfer-categories.js";
import { itemContentsOf } from "./transfer-contents.js";
import type { TransferResupplyContents } from "./transfer-resupply-contents.js";

/** Les lectures que l'arrêt de transfert du livreur assemble. */
export interface DriverTransferStopSources {
  readonly transfers: InternalTransfersReader;
  readonly contents: TransferOrderContentsReader;
  /** Le contenu des réassorts — l'emballé si la fiche est close (R3c). */
  readonly resupplies: TransferResupplyContents;
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
  const [itemContents, clienteles, binCounts, places] = await Promise.all([
    itemContentsOf(sources.contents, sources.resupplies, unfrozen),
    transferClientelesOf(sources.contents, [...loaded.values()]),
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
      ...(transfer === undefined ? {} : { siteId: transfer.siteId }),
      orderCount: row.orderCount,
      receivedAt: row.receivedAt?.toISOString() ?? null,
      totals: manifest?.totals ?? [],
      orders: manifest === undefined ? NO_SECTION : withClienteles(manifest.orders, clienteles),
      resupplies: manifest?.resupplies ?? NO_SECTION,
      binCount: binCounts.get(row.transferId) ?? 0,
      siteAddress: place?.address ?? null,
      siteGps: place?.gps ?? null,
    };
  });
}
