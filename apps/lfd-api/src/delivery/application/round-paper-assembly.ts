import { Injectable } from "@nestjs/common";

import { StaffAuthorDirectory } from "../../staff/directory/domain/staff-author-directory.js";
import {
  DeliveryColorsReader,
  DeliveryNoteNumbersReader,
  type DeliveryOrderProcedure,
  DeliveryOrdersReader,
  DeliveryProceduresReader,
  TransferOrderColorsReader,
  TransferOrderContentsReader,
  TransferSitePlacesReader,
  TransferSitesReader,
} from "../channels/commerce/index.js";
import { InternalTransfersReader } from "../domain/ports/internal-transfers.reader.js";
import type { RoundPaperRow } from "../domain/ports/round-paper.reader.js";
import { TransferBinCounts } from "../domain/ports/transfer-bin-counts.reader.js";
import { deliveryStopColor } from "../domain/services/delivery-stop-color.js";
import type { RoundPaper } from "../domain/services/round-paper.js";
import { driverNamesOf } from "./delivery-driver-support.js";
import { roundPaperOf } from "./round-paper-of.js";
import { roundPaperTransfersOf } from "./round-paper-transfers.js";
import { ShipmentNoteNumbers } from "./shipment-note-numbers.js";
import { TransferResupplyContents } from "./transfer-resupply-contents.js";

/** Les lectures qu'une feuille de tournée assemble, faites au tirage. */
export interface RoundPaperSources {
  readonly orders: DeliveryOrdersReader;
  readonly procedures: DeliveryProceduresReader;
  readonly directory: StaffAuthorDirectory;
  readonly transfers: InternalTransfersReader;
  readonly transferContents: TransferOrderContentsReader;
  readonly transferBins: TransferBinCounts;
  readonly sitePlaces: TransferSitePlacesReader;
  readonly sites: TransferSitesReader;
  readonly colors: DeliveryColorsReader;
  readonly resupplies: TransferResupplyContents;
  readonly transferColors: TransferOrderColorsReader;
  /** Le BL de chaque envoi, imprimé à côté de la commande (2026-10-26). */
  readonly noteNumbers: DeliveryNoteNumbersReader;
}

/** Ce qu'un tirage précise : le droit de lire la procédure, et l'instant. */
export interface RoundPaperDraw {
  /** `delivery_procedures:read` — sans lui, la procédure n'est même pas lue (DG-D8). */
  readonly canReadProcedures: boolean;
  readonly printedAt: Date;
}

/**
 * **Le papier d'une tournée, assemblé** — les feuilles du commerce, la
 * procédure, le livreur, les arrêts de transfert et les couleurs, lus au
 * tirage. La feuille seule (`round.pdf`) et le dossier des tournées
 * (2026-10-26) passent tous deux par ici : le livreur reçoit la même feuille,
 * d'où qu'elle sorte.
 */
export async function assembleRoundPaper(
  round: RoundPaperRow,
  draw: RoundPaperDraw,
  sources: RoundPaperSources,
): Promise<RoundPaper> {
  const orderIds = round.stops.map((stop) => stop.orderId);
  const driverIds = round.driverStaffId === null ? [] : [round.driverStaffId];
  const shipments = round.stops.map((stop) => ({ orderId: stop.orderId, rank: stop.shipmentRank }));
  const [sheets, procedures, names, transfers, colors, noteNumbers] = await Promise.all([
    sources.orders.departureSheetsOf(orderIds),
    proceduresOf(sources.procedures, orderIds, draw.canReadProcedures),
    driverNamesOf(sources.directory, driverIds),
    roundPaperTransfersOf(round.serviceDay, round.transferStops, {
      transfers: sources.transfers,
      contents: sources.transferContents,
      resupplies: sources.resupplies,
      bins: sources.transferBins,
      places: sources.sitePlaces,
      sites: sources.sites,
      colors: sources.transferColors,
    }),
    stopColorsOf(sources, orderIds),
    ShipmentNoteNumbers.read(sources.noteNumbers, shipments),
  ]);
  return roundPaperOf({
    round,
    sheets: new Map(sheets.map((sheet) => [sheet.orderId, sheet])),
    procedures: new Map(procedures.map((procedure) => [procedure.orderId, procedure.steps])),
    driverName: round.driverStaffId === null ? null : (names.get(round.driverStaffId) ?? null),
    printedAt: draw.printedAt,
    transfers,
    colors,
    noteNumbers,
  });
}

/**
 * La couleur de chaque arrêt, lue À CE TIRAGE (L5) : la clientèle au
 * commerce, les couleurs de livraison du départ aux sites.
 */
async function stopColorsOf(
  sources: RoundPaperSources,
  orderIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (orderIds.length === 0) {
    return new Map();
  }
  const [facts, colors] = await Promise.all([
    sources.orders.byIds(orderIds),
    sources.colors.departureColors(),
  ]);
  return new Map(
    facts.flatMap((fact) => {
      const color = deliveryStopColor(fact.clientele, colors);
      return color === null ? [] : [[fact.orderId, color] as const];
    }),
  );
}

/** Sans le droit, on ne lit même pas : la procédure ne sort pas. */
async function proceduresOf(
  procedures: DeliveryProceduresReader,
  orderIds: readonly string[],
  allowed: boolean,
): Promise<readonly DeliveryOrderProcedure[]> {
  return allowed && orderIds.length > 0 ? procedures.proceduresOf(orderIds) : [];
}

/**
 * Les mêmes lectures, injectées une fois — pour un handler qui assemble
 * plusieurs feuilles (le dossier des tournées) sans porter douze ports.
 */
@Injectable()
export class RoundPaperAssembler implements RoundPaperSources {
  constructor(
    readonly orders: DeliveryOrdersReader,
    readonly procedures: DeliveryProceduresReader,
    readonly directory: StaffAuthorDirectory,
    readonly transfers: InternalTransfersReader,
    readonly transferContents: TransferOrderContentsReader,
    readonly transferBins: TransferBinCounts,
    readonly sitePlaces: TransferSitePlacesReader,
    readonly sites: TransferSitesReader,
    readonly colors: DeliveryColorsReader,
    readonly resupplies: TransferResupplyContents,
    readonly transferColors: TransferOrderColorsReader,
    readonly noteNumbers: DeliveryNoteNumbersReader,
  ) {}

  paperOf(round: RoundPaperRow, draw: RoundPaperDraw): Promise<RoundPaper> {
    return assembleRoundPaper(round, draw, this);
  }
}
