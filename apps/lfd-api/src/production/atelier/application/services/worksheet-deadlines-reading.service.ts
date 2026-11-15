import { Injectable, Logger } from "@nestjs/common";

import { DueThresholdsReader } from "../../../channels/commerce/due-thresholds.reader.js";
import { ProductionTrancheSettingsReader, trancheThresholdsBySku } from "../../../day/index.js";
import type { ServiceDay, TrancheThreshold } from "../../../day/index.js";

/**
 * **Les tranches de chaque SKU d'une journée**, rangées par le réglage de
 * l'atelier — ce dont la fiche fait ses paliers (plan
 * `documentation/fournil/la-fiche-d-atelier.md`, §2).
 *
 * Les besoins du commerce par son port, le réglage par celui du noyau, et la
 * règle du noyau (`trancheThresholdsBySku`) : rien n'est recopié. La lecture
 * du canal vit ici, à l'atelier ; le dossier du jour a la sienne
 * (`DossierDeadlinesReading`), sur la même règle.
 *
 * ## Des besoins illisibles ne coûtent pas la fiche
 *
 * Comme les rayons : si le commerce ne répond pas, la panne est journalisée et
 * le service rend `null`. La fiche reste servie, sans paliers — les quantités
 * à sortir ne dépendent pas des heures.
 */
@Injectable()
export class WorksheetDeadlinesReading {
  private readonly logger = new Logger(WorksheetDeadlinesReading.name);

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
        `Fiche d'atelier du ${day.value} : tranches illisibles, servie sans paliers.`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }
}
