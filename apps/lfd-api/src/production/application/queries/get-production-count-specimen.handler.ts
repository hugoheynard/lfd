import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BrandLogoSource } from "../../../platform/brand/brand-logo.source.js";
import { Clock } from "../../../platform/time/clock.js";
import { renderProductionCountPdf } from "../../domain/services/atelier-sheet-pdf.js";
import { countColorSharesOf } from "../../domain/services/count-color-shares.js";
import { countOf } from "../../domain/services/production-count.js";
import { specimenServiceDay } from "../document-specimens/specimen-data.js";
import {
  SPECIMEN_DAY_COLORS,
  SPECIMEN_DAY_ORDERS,
  SPECIMEN_DAY_RESUPPLIES,
  SPECIMEN_DAY_RESUPPLY_COLORS,
} from "../document-specimens/specimen-day.js";
import type { ProductionPaper } from "../services/production-paper.service.js";
import { GetProductionCountSpecimenQuery } from "./get-production-count-specimen.query.js";

/**
 * **Rend le compte à produire d'exemple** par le rendu et les calculs mêmes
 * de la clôture (`countOf`, `countColorSharesOf`, `renderProductionCountPdf`)
 * — sans `ProductionPapers`, qui archive sous la clé d'une journée, ce qu'un
 * exemple ne fait pas.
 */
@QueryHandler(GetProductionCountSpecimenQuery)
export class GetProductionCountSpecimenHandler implements IQueryHandler<
  GetProductionCountSpecimenQuery,
  ProductionPaper
> {
  constructor(
    private readonly clock: Clock,
    private readonly logo: BrandLogoSource,
  ) {}

  async execute(): Promise<ProductionPaper> {
    const now = this.clock.now();
    const bytes = await renderProductionCountPdf(
      countOf([...SPECIMEN_DAY_ORDERS, ...SPECIMEN_DAY_RESUPPLIES]),
      { serviceDay: specimenServiceDay(now), closedAt: now, logo: await this.logo.load() },
      countColorSharesOf(
        SPECIMEN_DAY_ORDERS,
        SPECIMEN_DAY_RESUPPLIES,
        SPECIMEN_DAY_COLORS,
        SPECIMEN_DAY_RESUPPLY_COLORS,
      ),
    );
    return { bytes, fileName: "exemple-compte-a-produire.pdf" };
  }
}
