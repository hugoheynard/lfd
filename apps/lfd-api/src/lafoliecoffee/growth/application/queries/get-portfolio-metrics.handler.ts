import type { PortfolioMetricsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { PortfolioMetricsReader } from "../../domain/ports/portfolio-metrics.reader.js";
import { GetPortfolioMetricsQuery } from "./get-portfolio-metrics.query.js";

/**
 * Sert la barre de tête des Comptes clients.
 *
 * L'instant vient de l'horloge **ici**, une seule fois, et descend dans
 * l'adaptateur : les deux fenêtres de 30 jours doivent être découpées sur le même
 * « maintenant », sans quoi une commande pourrait tomber des deux côtés.
 */
@QueryHandler(GetPortfolioMetricsQuery)
export class GetPortfolioMetricsHandler implements IQueryHandler<
  GetPortfolioMetricsQuery,
  PortfolioMetricsView
> {
  constructor(
    private readonly reader: PortfolioMetricsReader,
    private readonly clock: Clock,
  ) {}

  execute(): Promise<PortfolioMetricsView> {
    return this.reader.load(this.clock.now());
  }
}
