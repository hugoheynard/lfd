import { Injectable, Logger } from "@nestjs/common";

import { DueThresholdsReader } from "../../../channels/commerce/due-thresholds.reader.js";
import { ProductionTrancheSettingsReader, trancheThresholdsBySku } from "../../../day/index.js";
import type { ServiceDay, TrancheThreshold } from "../../../day/index.js";

/**
 * **Les tranches de chaque SKU d'une journée**, dont le dossier du jour fait
 * son calendrier par tranche — les mêmes que la fiche d'atelier.
 *
 * Les besoins du commerce par son port, le réglage par celui du noyau, et la
 * règle du noyau (`trancheThresholdsBySku`). La lecture du canal vit ici, au
 * plan ; la fiche a la sienne (`WorksheetDeadlinesReading`), sur la même
 * règle.
 *
 * Si le commerce ne répond pas, la panne est journalisée et le service rend
 * `null` : le dossier est tiré sans calendrier, et n'est pas archivable — le
 * tirage suivant le refera.
 */
@Injectable()
export class DossierDeadlinesReading {
  private readonly logger = new Logger(DossierDeadlinesReading.name);

  constructor(
    private readonly thresholds: DueThresholdsReader,
    private readonly tranches: ProductionTrancheSettingsReader,
  ) {}

  /** Les seuils rangés par SKU, ou `null` si les besoins du jour sont illisibles. */
  async read(day: ServiceDay): Promise<ReadonlyMap<string, readonly TrancheThreshold[]> | null> {
    try {
      const [due, posed] = await Promise.all([
        this.thresholds.dueThresholdsFor(day),
        this.tranches.current(),
      ]);
      return trancheThresholdsBySku(due.items, posed);
    } catch (error) {
      this.logger.error(
        `Dossier du ${day.value} : tranches illisibles, tiré sans calendrier.`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }
}
