import type { ProductionWorksheetView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { WorksheetContents } from "../services/worksheet-contents.service.js";
import { GetProductionWorksheetQuery } from "./get-production-worksheet.query.js";

/**
 * **La fiche du fournil d'un jour NOMMÉ** — celle d'un lien partagé.
 *
 * Le handler ne tranche rien : il valide le jour et confie la lecture à
 * `WorksheetContents` (l'objet des journées, puis la base), que la fiche
 * « en cours » et la Préparation de la Supervision partagent. L'arbitrage
 * des sources vit dans `worksheetOf`, le rangement par rayon dans
 * `worksheetGroupsOf` — tous deux purs, donc éprouvés sans Nest ni base.
 *
 * Il n'écrit rien, pas même un compteur — §4.
 */
@QueryHandler(GetProductionWorksheetQuery)
export class GetProductionWorksheetHandler implements IQueryHandler<
  GetProductionWorksheetQuery,
  ProductionWorksheetView
> {
  constructor(private readonly worksheets: WorksheetContents) {}

  execute(query: GetProductionWorksheetQuery): Promise<ProductionWorksheetView> {
    return this.worksheets.read(ServiceDay.of(query.serviceDay));
  }
}
