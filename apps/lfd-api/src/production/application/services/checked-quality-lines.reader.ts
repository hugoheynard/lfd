import type { QualityLineStatus } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import type { ProductionDay } from "../../domain/entities/production-day.js";
import { QualityCheckReader } from "../../domain/ports/quality-check.reader.js";
import { QualityLineStatusReader } from "../../domain/ports/quality-line-status.reader.js";
import { qualityLinesOf } from "./quality-views.js";

/**
 * L'implémentation du port `QualityLineStatusReader`, côté qualité : les
 * contrôles rendus sur la journée, dérivés par la même règle que la
 * Supervision (`qualityLinesOf`). Deux écrans, une seule règle.
 */
@Injectable()
export class CheckedQualityLinesReader extends QualityLineStatusReader {
  constructor(private readonly checks: QualityCheckReader) {
    super();
  }

  async linesOf(day: ProductionDay): Promise<readonly QualityLineStatus[]> {
    return qualityLinesOf(day, await this.checks.forDay(day.day));
  }
}
