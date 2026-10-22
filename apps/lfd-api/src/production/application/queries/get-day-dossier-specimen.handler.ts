import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { AppConfig } from "../../../platform/config/app-config.js";
import { Clock } from "../../../platform/time/clock.js";
import { staffSigner } from "../../domain/entities/plan-signer.js";
import { dayDossierOf } from "../../domain/services/day-dossier.js";
import { renderDayDossierPdf } from "../../domain/services/day-dossier-pdf.js";
import { specimenServiceDay } from "../document-specimens/specimen-data.js";
import {
  SPECIMEN_DAY_COLORS,
  SPECIMEN_DAY_RESUPPLY_COLORS,
  SPECIMEN_DAY_ORDERS,
  SPECIMEN_DAY_RESUPPLIES,
  SPECIMEN_DAY_SHELVES,
} from "../document-specimens/specimen-day.js";
import type { ProductionPaper } from "../services/production-paper.service.js";
import { GetDayDossierSpecimenQuery } from "./get-day-dossier-specimen.query.js";

/**
 * **Rend le dossier du jour d'exemple** par le montage et le rendu mêmes du
 * vrai dossier (`dayDossierOf`, `renderDayDossierPdf`) : récapitulatif par
 * rayon, un bon par commande avec sa pastille, un bon de réassort — sans
 * `ProductionPapers`, qui archive par tirage, ce qu'un exemple ne fait pas.
 *
 * Arrêté par un membre du staff d'EXEMPLE (aucun identifiant réel), jamais
 * retiré. Les QR de colisage s'impriment comme sur la fiche d'atelier
 * d'exemple : ils ouvrent des références qui n'existent pas.
 */
@QueryHandler(GetDayDossierSpecimenQuery)
export class GetDayDossierSpecimenHandler implements IQueryHandler<
  GetDayDossierSpecimenQuery,
  ProductionPaper
> {
  constructor(
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async execute(): Promise<ProductionPaper> {
    const now = this.clock.now();
    const base = this.config.adminBaseUrl();
    const bytes = await renderDayDossierPdf(
      dayDossierOf(SPECIMEN_DAY_ORDERS, SPECIMEN_DAY_SHELVES, SPECIMEN_DAY_RESUPPLIES),
      {
        serviceDay: specimenServiceDay(now),
        closedAt: now,
        closedBy: staffSigner("specimen-staff", "EXEMPLE — Marie Dupont"),
        retakenAt: null,
        retakenByName: null,
      },
      (reference) => (base === null ? "" : `${base}/colisage/${encodeURIComponent(reference)}`),
      SPECIMEN_DAY_COLORS,
      SPECIMEN_DAY_RESUPPLY_COLORS,
    );
    return { bytes, fileName: "exemple-dossier-du-jour.pdf" };
  }
}
