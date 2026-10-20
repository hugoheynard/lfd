import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { renderRoundPaperPdf } from "../../domain/services/round-paper-pdf.js";
import { specimenRoundPaper } from "../document-specimens/specimen-data.js";
import type { RoundPaperFile } from "./get-round-paper-pdf.handler.js";
import { GetRoundPaperSpecimenQuery } from "./get-round-paper-specimen.query.js";

/**
 * **Rend la feuille de tournée d'exemple** par le rendu même des vraies
 * tournées (`renderRoundPaperPdf`). Ne lit ni tournée, ni commerce, ni
 * procédure : tout est dans les données d'exemple.
 */
@QueryHandler(GetRoundPaperSpecimenQuery)
export class GetRoundPaperSpecimenHandler implements IQueryHandler<
  GetRoundPaperSpecimenQuery,
  RoundPaperFile
> {
  constructor(private readonly clock: Clock) {}

  async execute(): Promise<RoundPaperFile> {
    const bytes = await renderRoundPaperPdf(specimenRoundPaper(this.clock.now()));
    return { bytes, fileName: "exemple-feuille-de-tournee.pdf" };
  }
}
