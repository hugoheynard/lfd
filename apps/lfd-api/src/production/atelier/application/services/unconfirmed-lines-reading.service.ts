import type { ProductionUnconfirmedLineView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { deadlinesOf, type ProductionDay, type ServiceDay } from "../../../day/index.js";
import { DayProblemsReader } from "../../domain/ports/production-problem.ports.js";
import { hasTimedDeadline } from "../../domain/services/always-green.js";
import { remainderUnderCeiling } from "../../domain/services/line-remainder.js";
import { AlwaysGreenLines } from "./always-green-lines.service.js";
import { DayTrackingLevelsReading } from "./day-tracking-levels-reading.service.js";
import { WorksheetDeadlinesReading } from "./worksheet-deadlines-reading.service.js";

/**
 * **Les lignes « à confirmer » d'une journée** (plan
 * `documentation/fournil/plan-niveaux-de-suivi.md`, § 3.7, § 3.8) : en
 * toujours vert, sans palier à heure — la fournée automatique ne les complète
 * pas —, et pas encore sorties jusqu'à leur compte (sous le plafond d'un
 * rouge, traité ou non).
 *
 * Les mêmes lectures que le cron, sans rien écrire : le niveau servi (figé,
 * sinon celui que le premier passage figera), les paliers relus en direct.
 * Une journée non arrêtée n'en a aucune.
 */
@Injectable()
export class UnconfirmedLinesReading {
  constructor(
    private readonly levels: DayTrackingLevelsReading,
    private readonly lines: AlwaysGreenLines,
    private readonly deadlines: WorksheetDeadlinesReading,
    private readonly problems: DayProblemsReader,
  ) {}

  async of(
    day: ServiceDay,
    current: ProductionDay,
  ): Promise<readonly ProductionUnconfirmedLineView[]> {
    if (current.closedAt === null) {
      return [];
    }
    const levels = await this.levels.levelsOf(day, { closedAt: current.closedAt });
    const skus = await this.lines.skusOf(day, current, levels);
    if (skus.length === 0) {
      return [];
    }
    const [tranches, problems] = await Promise.all([
      this.deadlines.read(day),
      this.problems.allOf(day),
    ]);
    const ceilings = new Map(problems.map((problem) => [problem.sku, problem.produced]));
    return current.counts
      .filter((item) => skus.includes(item.sku))
      .filter(
        (item) =>
          tranches === null ||
          !hasTimedDeadline(deadlinesOf(item.quantity, tranches.get(item.sku) ?? [])),
      )
      .map((item) => ({
        sku: item.sku,
        productName: item.productName,
        quantity: item.quantity,
        output: current.producedOf(item.sku),
      }))
      .filter(
        (line) =>
          remainderUnderCeiling(line.quantity, ceilings.get(line.sku) ?? null, line.output) > 0,
      );
  }
}
