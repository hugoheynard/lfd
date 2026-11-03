import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import type { ShortfallReportedLine } from "../../channels/commerce/index.js";
import { ShortfallFreezeDesk } from "../../channels/commerce/shortfall-freeze.desk.js";
import { PackingOrderNotDrawnYetError } from "../../domain/errors/packing-station-errors.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";

/**
 * L'implémentation du geste « figer le bac » (plan
 * `documentation/comptoir/depart-incomplet.md`, §4.2) : la
 * fiche la plus récente de l'envoi, sous verrou, signalée par l'agrégat,
 * réécrite. Tourne dans l'unité de travail du commerce — il n'en ouvre pas,
 * et ne publie rien.
 *
 * @sans-journal la décision du commerce est l'acte, écrite dans la même
 * transaction et publiée par lui (`order.shortfall_decided`).
 */
@Injectable()
export class PackingShortfallFreezeDesk extends ShortfallFreezeDesk {
  constructor(
    private readonly sheets: PackingSheetRepository,
    private readonly clock: Clock,
  ) {
    super();
  }

  /**
   * @throws {PackingOrderNotDrawnYetError} @throws {PackedOrderSealedError}
   * @throws {ContainersCountedError} @throws {NothingShortError}
   * @throws {ShortfallAlreadyAuthorizedError} @throws {PackingSheetWithdrawnError}
   */
  async freeze(orderId: string, rank: number): Promise<readonly ShortfallReportedLine[]> {
    const sheet = await this.sheets.lockLatestOf(orderId, rank);
    if (sheet === null) {
      throw new PackingOrderNotDrawnYetError(orderId);
    }
    const lines = sheet.reportShortfall(this.clock.now());
    await this.sheets.save(sheet);
    return lines.map((line) => ({ sku: line.sku, due: line.due, packed: line.packed }));
  }
}
