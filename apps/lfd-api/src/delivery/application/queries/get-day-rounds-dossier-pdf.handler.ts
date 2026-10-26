import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BrandLogoSource } from "../../../platform/brand/brand-logo.source.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryOrdersReader, TransferSiteColorsReader } from "../../channels/commerce/index.js";
import {
  DeliveryLoadingReader,
  type LoadingRoundRow,
} from "../../domain/ports/delivery-loading.reader.js";
import { DeliveryRoundsReader } from "../../domain/ports/delivery-rounds.reader.js";
import { DayRoundPapersReader } from "../../domain/ports/round-paper.reader.js";
import {
  dayRoundsDossierOf,
  type UnplacedDelivery,
} from "../../domain/services/day-rounds-dossier.js";
import {
  dayRoundsDossierFileName,
  renderDayRoundsDossierPdf,
} from "../../domain/services/day-rounds-dossier-pdf.js";
import { RoundPaperAssembler } from "../round-paper-assembly.js";
import type { RoundPaperFile } from "./get-round-paper-pdf.handler.js";
import { GetDayRoundsDossierPdfQuery } from "./get-day-rounds-dossier-pdf.query.js";

/**
 * **Le dossier des tournées du jour, tiré au moment** (décision de Hugo du
 * 2026-10-26). Comme la feuille seule, un papier VIVANT : chaque tirage relit
 * les tournées, leurs bacs, les feuilles du commerce et la procédure. Chaque
 * feuille est assemblée par le même chemin que `round.pdf`
 * (`RoundPaperAssembler`) : le livreur reçoit la même, d'où qu'elle sorte.
 *
 * Un jour sans tournée rend quand même un dossier — la répartition le dit, et
 * les livraisons non placées y figurent. Une lecture : elle n'écrit rien.
 */
@QueryHandler(GetDayRoundsDossierPdfQuery)
export class GetDayRoundsDossierPdfHandler implements IQueryHandler<
  GetDayRoundsDossierPdfQuery,
  RoundPaperFile
> {
  constructor(
    private readonly rounds: DayRoundPapersReader,
    private readonly papers: RoundPaperAssembler,
    private readonly loading: DeliveryLoadingReader,
    private readonly orders: DeliveryOrdersReader,
    private readonly composition: DeliveryRoundsReader,
    private readonly siteColors: TransferSiteColorsReader,
    private readonly logo: BrandLogoSource,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetDayRoundsDossierPdfQuery): Promise<RoundPaperFile> {
    const printedAt = this.clock.now();
    const draw = { canReadProcedures: query.canReadProcedures, printedAt };
    const [rows, loading, unplaced, logo] = await Promise.all([
      this.rounds.roundsOn(query.day),
      this.loading.roundsOn(query.day),
      this.unplacedOn(query.day),
      this.logo.load(),
    ]);
    const loadingById = new Map(loading.map((round) => [round.id, round]));
    const [rounds, siteColors] = await Promise.all([
      Promise.all(
        rows.map(async (row) => ({
          paper: await this.papers.paperOf(row, draw),
          loading: loadingById.get(row.id) ?? null,
        })),
      ),
      this.siteColors.colorsOf(siteIdsOf(loading)),
    ]);
    const dossier = dayRoundsDossierOf({
      serviceDay: query.day,
      printedAt,
      rounds,
      siteColors,
      unplaced,
    });
    return {
      fileName: dayRoundsDossierFileName(query.day),
      bytes: await renderDayRoundsDossierPdf(dossier, { logo }),
    };
  }

  /**
   * Les livraisons attendues ce jour, non annulées, qu'aucune tournée vivante
   * ne porte — de n'importe quel jour (I3) : une commande composée ailleurs
   * n'est pas « non placée ». Par référence, pour qu'elles se retrouvent.
   */
  private async unplacedOn(day: string): Promise<readonly UnplacedDelivery[]> {
    const expected = (await this.orders.expectedOn(day)).filter(
      (order) => order.status !== "cancelled",
    );
    if (expected.length === 0) {
      return [];
    }
    const composed = await this.composition.composedAmong(expected.map((order) => order.orderId));
    const loose = expected.filter((order) => !composed.has(order.orderId));
    if (loose.length === 0) {
      return [];
    }
    const facts = new Map(
      (await this.orders.byIds(loose.map((order) => order.orderId))).map((fact) => [
        fact.orderId,
        fact,
      ]),
    );
    return loose
      .map((order) => ({
        reference: order.reference,
        customerLabel: facts.get(order.orderId)?.customerLabel ?? "",
      }))
      .sort((a, b) => a.reference.localeCompare(b.reference));
  }
}

/** Les sites des arrêts de transfert du jour, sans doublon. */
function siteIdsOf(rounds: readonly LoadingRoundRow[]): readonly string[] {
  return [
    ...new Set(
      rounds.flatMap((round) =>
        round.stops.flatMap((stop) => (stop.siteId === null ? [] : [stop.siteId])),
      ),
    ),
  ];
}
