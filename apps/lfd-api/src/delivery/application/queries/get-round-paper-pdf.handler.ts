import type { Buffer } from "node:buffer";

import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import {
  DeliveryColorsReader,
  DeliveryOrdersReader,
  DeliveryProceduresReader,
  TransferOrderColorsReader,
  TransferOrderContentsReader,
  TransferSitePlacesReader,
  TransferSitesReader,
} from "../../channels/commerce/index.js";
import { InternalTransfersReader } from "../../domain/ports/internal-transfers.reader.js";
import { TransferBinCounts } from "../../domain/ports/transfer-bin-counts.reader.js";
import { DeliveryRoundNotFoundError } from "../../domain/errors/delivery-round-errors.js";
import { RoundPaperReader } from "../../domain/ports/round-paper.reader.js";
import { renderRoundPaperPdf, roundPaperFileName } from "../../domain/services/round-paper-pdf.js";
import { GetRoundPaperPdfQuery } from "./get-round-paper-pdf.query.js";
import { assembleRoundPaper, type RoundPaperSources } from "../round-paper-assembly.js";
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
    const paper = await assembleRoundPaper(
      round,
      { canReadProcedures: query.canReadProcedures, printedAt: this.clock.now() },
      this.sources(),
    );
    return { fileName: roundPaperFileName(paper), bytes: await renderRoundPaperPdf(paper) };
  }

  private sources(): RoundPaperSources {
    return {
      orders: this.orders,
      procedures: this.procedures,
      directory: this.directory,
      transfers: this.transfers,
      transferContents: this.transferContents,
      transferBins: this.transferBins,
      sitePlaces: this.sitePlaces,
      sites: this.sites,
      colors: this.colors,
      resupplies: this.resupplies,
      transferColors: this.transferColors,
    };
  }
}
