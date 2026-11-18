import type { ProductionUnconfirmedLineView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { deadlinesOf, type ProductionDay, type ServiceDay } from "../../../day/index.js";
import { DayProblemsReader } from "../../domain/ports/production-problem.ports.js";
import { unautomatedRemainder } from "../../domain/services/always-green.js";
import { AlwaysGreenLines } from "./always-green-lines.service.js";
import { DayTrackingLevelsReading } from "./day-tracking-levels-reading.service.js";
import { WorksheetDeadlinesReading } from "./worksheet-deadlines-reading.service.js";

/**
 * **Les lignes « à confirmer » d'une journée** (
 * `documentation/fournil/les-niveaux-de-suivi.md`) : en
 * toujours vert, dont une part du reste (sous le plafond d'un rouge, traité
 * ou non) n'a pas de palier à heure — la fournée automatique ne la complète
 * jamais, qu'elle soit toute la ligne ou un reste « la journée » à côté de
 * paliers à heure.
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
      .map((item) => ({
        sku: item.sku,
        productName: item.productName,
        quantity: item.quantity,
        output: current.producedOf(item.sku),
      }))
      .filter(
        (line) =>
          unautomatedRemainder({
            serviceDay: day.value,
            counted: line.quantity,
            deadlines:
              tranches === null ? null : deadlinesOf(line.quantity, tranches.get(line.sku) ?? []),
            ceiling: ceilings.get(line.sku) ?? null,
            output: line.output,
          }) > 0,
      );
  }
}
