import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import { ShortfallDesk, type DepartingLine } from "../../channels/commerce/index.js";
import { ShortfallSheetNotFoundError } from "../../domain/errors/packing-shortfall-errors.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";

/**
 * L'implémentation du guichet du départ incomplet (E6b) : le bac le plus
 * récent de la commande, sous verrou, autorisé par l'agrégat, réécrit. Tourne
 * dans l'unité de travail du commerce — il n'en ouvre pas.
 *
 * @sans-journal la décision est l'acte, écrite par le commerce dans la même
 * transaction ; la fiche n'en est que l'effet.
 */
@Injectable()
export class PackingShortfallDesk extends ShortfallDesk {
  constructor(
    private readonly sheets: PackingSheetRepository,
    private readonly clock: Clock,
  ) {
    super();
  }

  async authorize(
    orderId: string,
    departing: readonly DepartingLine[],
    decidedBy: string,
  ): Promise<void> {
    const sheet = await this.sheets.lockLatestOf(orderId);
    if (sheet === null) {
      throw new ShortfallSheetNotFoundError(orderId);
    }
    sheet.authorizeShortfall(departing, { at: this.clock.now(), by: decidedBy });
    await this.sheets.save(sheet);
  }
}
