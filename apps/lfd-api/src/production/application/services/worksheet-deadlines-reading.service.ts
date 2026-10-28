import { Injectable, Logger } from "@nestjs/common";

import { DueThresholdsReader } from "../../channels/commerce/due-thresholds.reader.js";
import { ProductionTrancheSettings } from "../../domain/entities/production-tranche-settings.js";
import { ProductionTrancheSettingsReader } from "../../domain/ports/production-tranche-settings.reader.js";
import {
  rangeInTranches,
  type TrancheThreshold,
} from "../../domain/services/production-tranches.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * **Les tranches de chaque SKU d'une journée**, rangées par le réglage de
 * l'atelier — ce dont la fiche fait ses paliers (plan
 * `documentation/fournil/plan-fournee-v3.md`, §2).
 *
 * La même lecture que `GetProductionDueThresholdsHandler` : les besoins du
 * commerce par son port, le réglage par le sien, et `rangeInTranches` pour la
 * règle. Rien n'est recopié ; un service plutôt qu'un appel au handler, parce
 * qu'un handler n'en appelle pas un autre (§4).
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
      const settings = posed ?? ProductionTrancheSettings.defaults();
      const fixedTranches = settings.mode === "fixed" ? settings.fixedTranches : [];
      return new Map(
        rangeInTranches(due.items, settings.mode, fixedTranches).map(
          (line) => [line.sku, line.thresholds] as const,
        ),
      );
    } catch (error) {
      this.logger.error(
        `Fiche d'atelier du ${day.value} : tranches illisibles, servie sans paliers.`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }
}
