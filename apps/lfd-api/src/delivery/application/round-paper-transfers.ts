import type {
  TransferOrderContentsReader,
  TransferSitePlacesReader,
  TransferSitesReader,
} from "../channels/commerce/index.js";
import type { InternalTransfer } from "../domain/entities/internal-transfer.js";
import type { InternalTransfersReader } from "../domain/ports/internal-transfers.reader.js";
import type { RoundPaperTransferStopRow } from "../domain/ports/round-paper.reader.js";
import type { TransferBinCounts } from "../domain/ports/transfer-bin-counts.reader.js";
import type { ManifestLine } from "../domain/services/transfer-manifest.js";
import type {
  RoundPaperTransferLine,
  RoundPaperTransferStop,
} from "../domain/services/round-paper.js";
import { addressLinesOf } from "./round-paper-address.js";
import { itemContentsOf } from "./transfer-contents.js";
import type { TransferResupplyContents } from "./transfer-resupply-contents.js";

/** Les lectures qu'un arrêt de transfert imprimé assemble. */
export interface RoundPaperTransferSources {
  readonly transfers: InternalTransfersReader;
  readonly contents: TransferOrderContentsReader;
  /** Le contenu des réassorts — l'emballé si la fiche est close (R3c). */
  readonly resupplies: TransferResupplyContents;
  readonly bins: TransferBinCounts;
  readonly places: TransferSitePlacesReader;
  readonly sites: TransferSitesReader;
}

/**
 * **Les arrêts de transfert de la feuille de route** (décision de Hugo du
 * 2026-10-13) — par transfert : le site et son adresse, l'heure d'arrivée
 * requise (la même règle que l'échéance du fournil, `TransferSitesReader`),
 * les bacs, et le manifeste — figé s'il est parti, calculé sinon. Un
 * transfert introuvable est absent : la feuille ne l'invente pas.
 */
export async function roundPaperTransfersOf(
  day: string,
  rows: readonly RoundPaperTransferStopRow[],
  sources: RoundPaperTransferSources,
): Promise<ReadonlyMap<string, RoundPaperTransferStop>> {
  if (rows.length === 0) {
    return new Map();
  }
  const loaded: InternalTransfer[] = [];
  for (const row of rows) {
    const transfer = await sources.transfers.byId(row.transferId);
    if (transfer !== null) {
      loaded.push(transfer);
    }
  }
  const siteIds = [...new Set(loaded.map((transfer) => transfer.siteId))];
  const [contents, bins, places, sites] = await Promise.all([
    itemContentsOf(
      sources.contents,
      sources.resupplies,
      loaded.filter((transfer) => transfer.departedAt === null),
    ),
    sources.bins.liveBinCounts(loaded.map((transfer) => transfer.id)),
    sources.places.placesOf(siteIds),
    sources.sites.sitesFor(day, siteIds),
  ]);
  return new Map(
    loaded.map((transfer) => {
      const manifest = transfer.manifest(contents);
      const place = places.get(transfer.siteId);
      const stop: RoundPaperTransferStop = {
        kind: "transfer",
        siteLabel: transfer.siteLabel,
        addressLines: addressLinesOf(place?.address ?? null),
        arrivalBy: sites.get(transfer.siteId)?.arrivalBy ?? null,
        binCount: bins.get(transfer.id) ?? 0,
        orderCount: manifest.orders.items.length,
        orderTotals: printedLines(manifest.orders.totals),
        resupplyCount: manifest.resupplies.items.length,
        resupplyTotals: printedLines(manifest.resupplies.totals),
      };
      return [transfer.id, stop];
    }),
  );
}

function printedLines(lines: readonly ManifestLine[]): readonly RoundPaperTransferLine[] {
  return lines.map((line) => ({ productName: line.productName, quantity: line.quantity }));
}
