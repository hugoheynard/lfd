import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { AppConfig } from "../../../platform/config/app-config.js";
import { Clock } from "../../../platform/time/clock.js";
import { renderAtelierSheetPdf } from "../../domain/services/atelier-sheet-pdf.js";
import { SPECIMEN_ORDER, specimenServiceDay } from "../document-specimens/specimen-data.js";
import type { ProductionPaper } from "../services/production-paper.service.js";
import { GetAtelierSheetSpecimenQuery } from "./get-atelier-sheet-specimen.query.js";

/**
 * **Rend la fiche d'atelier d'exemple** par le rendu même des vraies fiches
 * (`renderAtelierSheetPdf`) — sans `ProductionPapers`, qui range sous la clé
 * d'une commande, ce qu'un exemple ne fait pas.
 *
 * Le QR de colisage s'imprime comme sur une vraie fiche (il encode un nom,
 * pas un secret) : scanné, il ouvre le colisage d'une référence qui n'existe
 * pas. Il est là pour qu'on contrôle sa place sur le papier.
 */
@QueryHandler(GetAtelierSheetSpecimenQuery)
export class GetAtelierSheetSpecimenHandler implements IQueryHandler<
  GetAtelierSheetSpecimenQuery,
  ProductionPaper
> {
  constructor(
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async execute(): Promise<ProductionPaper> {
    const now = this.clock.now();
    const base = this.config.adminBaseUrl();
    const colisageUrl =
      base === null ? "" : `${base}/colisage/${encodeURIComponent(SPECIMEN_ORDER.reference)}`;
    const bytes = await renderAtelierSheetPdf(
      SPECIMEN_ORDER,
      specimenServiceDay(now),
      now,
      colisageUrl,
      // Le spécimen n'a pas de commande réelle, donc pas de couleur : comme
      // la planche (`categoryColor: null`), aucune pastille.
      null,
    );
    return { bytes, fileName: "exemple-fiche-atelier.pdf" };
  }
}
