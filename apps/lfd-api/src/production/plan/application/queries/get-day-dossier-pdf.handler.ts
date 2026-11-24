import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ProductionDayRepository } from "../../../day/index.js";
import { ServiceDay } from "../../../day/index.js";
import { ProductionPaperArchive, type ProductionPaper } from "../../../shared/print/index.js";
import { ProductionPaperRenderer, dayDossierSlotOf } from "../services/production-paper.service.js";
import { isWholeDossier } from "../../domain/services/day-dossier-selection.js";
import { GetDayDossierPdfQuery } from "./get-day-dossier-pdf.query.js";

/**
 * Le dossier du jour — refusé tant que la journée n'est pas arrêtée : il se lit
 * dans ce qu'elle a figé, et c'est ce papier-là qui part au fournil.
 *
 * Entier, il est archivé au premier tirage et relu ensuite. Une **sélection**
 * (des parties, des rayons, des commandes) se tire du même dossier figé, mais
 * n'est ni archivée ni lue dans l'archive : l'exemplaire rangé est le papier
 * complet de l'arrêt, et un extrait rangé à sa place le ferait mentir.
 */
@QueryHandler(GetDayDossierPdfQuery)
export class GetDayDossierPdfHandler implements IQueryHandler<
  GetDayDossierPdfQuery,
  ProductionPaper
> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly renderer: ProductionPaperRenderer,
    private readonly archive: ProductionPaperArchive,
  ) {}

  async execute(query: GetDayDossierPdfQuery): Promise<ProductionPaper> {
    const day = await this.days.load(ServiceDay.of(query.serviceDay));
    const slot = dayDossierSlotOf(day);
    if (isWholeDossier(query.selection)) {
      return this.archive.storedOr(slot, () => this.renderer.dossierOf(day));
    }
    const { bytes } = await this.renderer.dossierOf(day, query.selection);
    return { bytes, fileName: slot.fileName.replace(/\.pdf$/u, "-extrait.pdf") };
  }
}
