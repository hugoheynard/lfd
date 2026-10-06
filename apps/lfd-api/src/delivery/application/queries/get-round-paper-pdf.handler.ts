import type { Buffer } from "node:buffer";

import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import {
  DeliveryOrdersReader,
  type DeliveryOrderProcedure,
  DeliveryProceduresReader,
} from "../../channels/commerce/index.js";
import { DeliveryRoundNotFoundError } from "../../domain/errors/delivery-round-errors.js";
import { RoundPaperReader } from "../../domain/ports/round-paper.reader.js";
import { renderRoundPaperPdf, roundPaperFileName } from "../../domain/services/round-paper-pdf.js";
import { driverNamesOf } from "../delivery-driver-support.js";
import { roundPaperOf } from "../round-paper-of.js";
import { GetRoundPaperPdfQuery } from "./get-round-paper-pdf.query.js";

/** Un papier servi : ses octets et le nom proposé au téléchargement. */
export interface RoundPaperFile {
  readonly fileName: string;
  readonly bytes: Buffer;
}

/**
 * **La feuille de tournée, tirée au moment** (Livraison → Tournées,
 * « Imprimer »). Un papier VIVANT : rien n'est rangé, chaque tirage relit la
 * tournée, les feuilles du commerce et la procédure — un second tirage après
 * une correction du carnet imprime la correction. Une lecture : elle n'écrit
 * rien.
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
  ) {}

  async execute(query: GetRoundPaperPdfQuery): Promise<RoundPaperFile> {
    const round = await this.rounds.roundOf(query.roundId);
    if (round === null) {
      throw new DeliveryRoundNotFoundError(query.roundId);
    }
    const orderIds = round.stops.map((stop) => stop.orderId);
    const driverIds = round.driverStaffId === null ? [] : [round.driverStaffId];
    const [sheets, procedures, names] = await Promise.all([
      this.orders.departureSheetsOf(orderIds),
      this.proceduresOf(orderIds, query.canReadProcedures),
      driverNamesOf(this.directory, driverIds),
    ]);
    const paper = roundPaperOf({
      round,
      sheets: new Map(sheets.map((sheet) => [sheet.orderId, sheet])),
      procedures: new Map(procedures.map((procedure) => [procedure.orderId, procedure.steps])),
      driverName: round.driverStaffId === null ? null : (names.get(round.driverStaffId) ?? null),
      printedAt: this.clock.now(),
    });
    return { fileName: roundPaperFileName(paper), bytes: await renderRoundPaperPdf(paper) };
  }

  /** Sans le droit, on ne lit même pas : la procédure ne sort pas. */
  private async proceduresOf(
    orderIds: readonly string[],
    allowed: boolean,
  ): Promise<readonly DeliveryOrderProcedure[]> {
    return allowed && orderIds.length > 0 ? this.procedures.proceduresOf(orderIds) : [];
  }
}
