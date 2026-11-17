import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BrandLogoSource } from "../../../../platform/brand/brand-logo.source.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ProductionArticlesReader } from "../../../channels/commerce/production-articles.reader.js";
import {
  ProductionDisplaySettings,
  ProductionDisplaySettingsReader,
  type ProductionPaper,
} from "../../../shared/print/index.js";
import { SimulationGroupingUnreadableError } from "../../domain/errors/production-simulation-errors.js";
import { dayDossierFrom } from "../../domain/services/day-dossier.js";
import { dossierCalendarOf } from "../../domain/services/day-dossier-calendar.js";
import {
  simulationCoverOf,
  simulationLinesOf,
  simulationOrderOf,
} from "../../domain/services/production-simulation.js";
import { renderProductionSimulationPdf } from "../../domain/services/production-simulation-pdf.js";
import { GroupingSourceReading } from "../../../workstations/index.js";
import { GetProductionSimulationPdfQuery } from "./get-production-simulation-pdf.query.js";

/** Ce que les journaux du rangement disent de la simulation, à la place d'un jour. */
const SIMULATION_LABEL = "Simulation du catalogue";

/**
 * **Rend la simulation du catalogue** dans le mode demandé : les articles
 * vendables du miroir du commerce, une pièce chacun, dans une commande
 * fictive ; le rangement lu par la lecture même du dossier
 * (`GroupingSourceReading`, celle de la fiche aussi), monté par `dayDossierFrom`, et la partie
 * « un rayon et son calendrier » dessinée par le code du dossier.
 *
 * Le calendrier se tire **sans tranches** : une commande fictive n'a pas
 * d'échéance, et les tranches réelles viennent des besoins datés du commerce.
 * Chaque article tombe donc dans « Sans heure » — la page montre la mise en
 * page, pas un horaire.
 *
 * Aucun port d'écriture : rien n'est persisté, ni archivé, ni envoyé. Une
 * lecture du rangement en panne refuse la simulation plutôt que de montrer
 * un autre rangement que celui demandé.
 */
@QueryHandler(GetProductionSimulationPdfQuery)
export class GetProductionSimulationPdfHandler implements IQueryHandler<
  GetProductionSimulationPdfQuery,
  ProductionPaper
> {
  constructor(
    private readonly articles: ProductionArticlesReader,
    private readonly grouping: GroupingSourceReading,
    private readonly display: ProductionDisplaySettingsReader,
    private readonly logo: BrandLogoSource,
    private readonly clock: Clock,
  ) {}

  /** @throws {SimulationGroupingUnreadableError} les rayons ou les postes sont illisibles. */
  async execute(query: GetProductionSimulationPdfQuery): Promise<ProductionPaper> {
    const sellable = (await this.articles.allArticles()).filter((article) => article.sellable);
    const lines = simulationLinesOf(
      sellable.map((article) => ({ sku: article.sku, name: article.variantName })),
    );
    const [grouping, display, logo] = await Promise.all([
      this.grouping.read(
        lines.map((line) => line.sku),
        query.mode,
        SIMULATION_LABEL,
      ),
      this.display.current(),
      this.logo.load(),
    ]);
    if (!grouping.shelvesKnown) {
      throw new SimulationGroupingUnreadableError("rayons");
    }
    if (!grouping.workstationsKnown) {
      throw new SimulationGroupingUnreadableError("postes");
    }
    const { showSubcategories } = display ?? ProductionDisplaySettings.defaults();
    const dossier = dayDossierFrom(
      [simulationOrderOf(lines)],
      grouping.source,
      [],
      showSubcategories,
    );
    const bytes = await renderProductionSimulationPdf(
      simulationCoverOf(lines, grouping.source),
      dossier,
      dossierCalendarOf(dossier.recap, new Map()),
      { logo, at: this.clock.now() },
    );
    return { bytes, fileName: `simulation-catalogue-${query.mode}.pdf` };
  }
}
