import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BrandLogoSource } from "../../../../platform/brand/brand-logo.source.js";
import { Clock } from "../../../../platform/time/clock.js";
import { specimenServiceDay } from "../../../shared/print/index.js";
import type { ProductionPaper } from "../../../shared/print/index.js";
import { dayDossierOf } from "../../domain/services/day-dossier.js";
import { dossierCalendarOf } from "../../domain/services/day-dossier-calendar.js";
import { renderDayDossierPdf } from "../../domain/services/day-dossier-pdf.js";
import {
  SPECIMEN_DAY_COLORS,
  SPECIMEN_DAY_ORDERS,
  SPECIMEN_DAY_RESUPPLIES,
  SPECIMEN_DAY_RESUPPLY_COLORS,
  SPECIMEN_DAY_SHELVES,
  SPECIMEN_DAY_TRANCHES,
} from "../document-specimens/specimen-day.js";
import { GetProvisionalDossierSpecimenQuery } from "./get-provisional-dossier-specimen.query.js";

/** Le numéro d'exemple : une troisième impression de la journée. */
const SPECIMEN_RUN = 3;

/**
 * **Rend une impression provisoire d'exemple** par le rendu même du dossier
 * (`renderDayDossierPdf`), sur la journée d'exemple : en-tête « Provisoire
 * JJ/MM #3 hh:mm » et pied « Provisoire — plan non arrêté » sur chaque page.
 * Sans QR ni BL : l'exemple du dossier arrêté les montre déjà, celui-ci montre
 * ce qui change.
 */
@QueryHandler(GetProvisionalDossierSpecimenQuery)
export class GetProvisionalDossierSpecimenHandler implements IQueryHandler<
  GetProvisionalDossierSpecimenQuery,
  ProductionPaper
> {
  constructor(
    private readonly clock: Clock,
    private readonly logo: BrandLogoSource,
  ) {}

  async execute(): Promise<ProductionPaper> {
    const now = this.clock.now();
    const serviceDay = specimenServiceDay(now);
    const dossier = dayDossierOf(
      SPECIMEN_DAY_ORDERS,
      SPECIMEN_DAY_SHELVES,
      SPECIMEN_DAY_RESUPPLIES,
    );
    const bytes = await renderDayDossierPdf(
      dossier,
      {
        serviceDay,
        closedAt: now,
        closedBy: null,
        retakenAt: null,
        retakenByName: null,
        printRun: SPECIMEN_RUN,
        provisional: { run: SPECIMEN_RUN, printedAt: now },
      },
      {
        logo: await this.logo.load(),
        colisageUrlOf: () => "",
        colors: SPECIMEN_DAY_COLORS,
        resupplyColors: SPECIMEN_DAY_RESUPPLY_COLORS,
        deliveryNotes: new Map(),
      },
      dossierCalendarOf(dossier.recap, SPECIMEN_DAY_TRANCHES),
    );
    return { bytes, fileName: "exemple-dossier-provisoire.pdf" };
  }
}
