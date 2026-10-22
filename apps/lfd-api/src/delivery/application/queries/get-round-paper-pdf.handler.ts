import type { Buffer } from "node:buffer";

import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import {
  DeliveryColorsReader,
  DeliveryOrdersReader,
  type DeliveryOrderProcedure,
  DeliveryProceduresReader,
  TransferOrderColorsReader,
  TransferOrderContentsReader,
  TransferSitePlacesReader,
  TransferSitesReader,
} from "../../channels/commerce/index.js";
import { InternalTransfersReader } from "../../domain/ports/internal-transfers.reader.js";
import { TransferBinCounts } from "../../domain/ports/transfer-bin-counts.reader.js";
import { roundPaperTransfersOf } from "../round-paper-transfers.js";
import { DeliveryRoundNotFoundError } from "../../domain/errors/delivery-round-errors.js";
import { RoundPaperReader } from "../../domain/ports/round-paper.reader.js";
import { deliveryStopColor } from "../../domain/services/delivery-stop-color.js";
import { renderRoundPaperPdf, roundPaperFileName } from "../../domain/services/round-paper-pdf.js";
import { driverNamesOf } from "../delivery-driver-support.js";
import { roundPaperOf } from "../round-paper-of.js";
import { GetRoundPaperPdfQuery } from "./get-round-paper-pdf.query.js";
import { TransferResupplyContents } from "../transfer-resupply-contents.js";

/** Un papier servi : ses octets et le nom proposé au téléchargement. */
export interface RoundPaperFile {
  readonly fileName: string;
  readonly bytes: Buffer;
}

/**
 * **La feuille de tournée, tirée au moment** (Livraison → Tournées,
 * « Imprimer »). Un papier VIVANT : rien n'est rangé, chaque tirage relit la
 * tournée, les feuilles du commerce et la procédure — un second tirage après
 * une correction du carnet imprime la correction. Les arrêts de transfert y
 * sont à leur place (2026-10-13) : site, heure, bacs, manifeste. Une lecture :
 * elle n'écrit rien.
 *
 * @throws {DeliveryRoundNotFoundError}
 */
@QueryHandler(GetRoundPaperPdfQuery)
export class GetRoundPaperPdfHandler implements IQueryHandler<
  GetRoundPaperPdfQuery,
  RoundPaperFile
> {
  constructor(
    private readonly rounds: RoundPaperReader,
    private readonly orders: DeliveryOrdersReader,
    private readonly procedures: DeliveryProceduresReader,
    private readonly directory: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly transfers: InternalTransfersReader,
    private readonly transferContents: TransferOrderContentsReader,
    private readonly transferBins: TransferBinCounts,
    private readonly sitePlaces: TransferSitePlacesReader,
    private readonly sites: TransferSitesReader,
    private readonly colors: DeliveryColorsReader,
    private readonly resupplies: TransferResupplyContents,
    private readonly transferColors: TransferOrderColorsReader,
  ) {}

  async execute(query: GetRoundPaperPdfQuery): Promise<RoundPaperFile> {
    const round = await this.rounds.roundOf(query.roundId);
    if (round === null) {
      throw new DeliveryRoundNotFoundError(query.roundId);
    }
    const orderIds = round.stops.map((stop) => stop.orderId);
    const driverIds = round.driverStaffId === null ? [] : [round.driverStaffId];
    const [sheets, procedures, names, transfers] = await Promise.all([
      this.orders.departureSheetsOf(orderIds),
      this.proceduresOf(orderIds, query.canReadProcedures),
      driverNamesOf(this.directory, driverIds),
      roundPaperTransfersOf(round.serviceDay, round.transferStops, {
        transfers: this.transfers,
        contents: this.transferContents,
        resupplies: this.resupplies,
        bins: this.transferBins,
        places: this.sitePlaces,
        sites: this.sites,
        colors: this.transferColors,
      }),
    ]);
    const paper = roundPaperOf({
      round,
      sheets: new Map(sheets.map((sheet) => [sheet.orderId, sheet])),
      procedures: new Map(procedures.map((procedure) => [procedure.orderId, procedure.steps])),
      driverName: round.driverStaffId === null ? null : (names.get(round.driverStaffId) ?? null),
      printedAt: this.clock.now(),
      transfers,
      colors: await this.colorsOf(orderIds),
    });
    return { fileName: roundPaperFileName(paper), bytes: await renderRoundPaperPdf(paper) };
  }

  /**
   * La couleur de chaque arrêt, lue À CE TIRAGE (L5) : la clientèle au
   * commerce, les couleurs de livraison du départ aux sites.
   */
  private async colorsOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (orderIds.length === 0) {
      return new Map();
    }
    const [facts, colors] = await Promise.all([
      this.orders.byIds(orderIds),
      this.colors.departureColors(),
    ]);
    return new Map(
      facts.flatMap((fact) => {
        const color = deliveryStopColor(fact.clientele, colors);
        return color === null ? [] : [[fact.orderId, color] as const];
      }),
    );
  }

  /** Sans le droit, on ne lit même pas : la procédure ne sort pas. */
  private async proceduresOf(
    orderIds: readonly string[],
    allowed: boolean,
  ): Promise<readonly DeliveryOrderProcedure[]> {
    return allowed && orderIds.length > 0 ? this.procedures.proceduresOf(orderIds) : [];
  }
}
