import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BrandLogoSource } from "../../../../platform/brand/brand-logo.source.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { GroupingSource, ProductionPaper } from "../../../shared/print/index.js";
import { dayDossierFrom } from "../../domain/services/day-dossier.js";
import { dossierCalendarOf } from "../../domain/services/day-dossier-calendar.js";
import {
  simulationCoverOf,
  simulationLinesOf,
  simulationOrderOf,
} from "../../domain/services/production-simulation.js";
import { renderProductionSimulationPdf } from "../../domain/services/production-simulation-pdf.js";
import {
  SPECIMEN_SIMULATION_ARTICLES,
  SPECIMEN_SIMULATION_PLACEMENT,
} from "../document-specimens/specimen-simulation.js";
import { GetProductionSimulationSpecimenQuery } from "./get-production-simulation-specimen.query.js";

/**
 * **Rend la simulation du catalogue d'exemple**, en mode prod, par le
 * montage et le rendu mêmes que la vraie (`dayDossierFrom`,
 * `renderProductionSimulationPdf`) : deux postes, un article « à ranger »,
 * un hors catalogue. Comme la vraie, son calendrier n'a pas de tranches.
 */
@QueryHandler(GetProductionSimulationSpecimenQuery)
export class GetProductionSimulationSpecimenHandler implements IQueryHandler<
  GetProductionSimulationSpecimenQuery,
  ProductionPaper
> {
  constructor(
    private readonly clock: Clock,
    private readonly logo: BrandLogoSource,
  ) {}

  async execute(): Promise<ProductionPaper> {
    const lines = simulationLinesOf(SPECIMEN_SIMULATION_ARTICLES);
    const source: GroupingSource = {
      mode: "workstation",
      placement: SPECIMEN_SIMULATION_PLACEMENT,
    };
    const dossier = dayDossierFrom([simulationOrderOf(lines)], source);
    const bytes = await renderProductionSimulationPdf(
      simulationCoverOf(lines, source),
      dossier,
      dossierCalendarOf(dossier.recap, new Map()),
      { logo: await this.logo.load(), at: this.clock.now() },
    );
    return { bytes, fileName: "exemple-simulation-catalogue.pdf" };
  }
}
