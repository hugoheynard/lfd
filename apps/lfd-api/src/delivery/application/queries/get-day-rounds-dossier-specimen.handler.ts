import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BrandLogoSource } from "../../../platform/brand/brand-logo.source.js";
import { Clock } from "../../../platform/time/clock.js";
import { renderDayRoundsDossierPdf } from "../../domain/services/day-rounds-dossier-pdf.js";
import { specimenRoundsDossier } from "../document-specimens/specimen-rounds-dossier.js";
import type { RoundPaperFile } from "./get-round-paper-pdf.handler.js";
import { GetDayRoundsDossierSpecimenQuery } from "./get-day-rounds-dossier-specimen.query.js";

/**
 * **Rend le dossier des tournées d'exemple** par le rendu même des vrais
 * dossiers (`renderDayRoundsDossierPdf`). Ne lit ni tournée, ni commerce :
 * tout est dans les données d'exemple, sauf le logo.
 */
@QueryHandler(GetDayRoundsDossierSpecimenQuery)
export class GetDayRoundsDossierSpecimenHandler implements IQueryHandler<
  GetDayRoundsDossierSpecimenQuery,
  RoundPaperFile
> {
  constructor(
    private readonly clock: Clock,
    private readonly logo: BrandLogoSource,
  ) {}

  async execute(): Promise<RoundPaperFile> {
    const bytes = await renderDayRoundsDossierPdf(specimenRoundsDossier(this.clock.now()), {
      logo: await this.logo.load(),
    });
    return { bytes, fileName: "exemple-dossier-tournees.pdf" };
  }
}
