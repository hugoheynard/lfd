import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BrandLogoSource } from "../../../platform/brand/brand-logo.source.js";
import { AppConfig } from "../../../platform/config/app-config.js";
import { Clock } from "../../../platform/time/clock.js";
import { SpecimenDeliveryNoteReader } from "../../channels/commerce/planned-delivery-notes.reader.js";
import { staffSigner } from "../../domain/entities/plan-signer.js";
import { dayDossierOf } from "../../domain/services/day-dossier.js";
import { renderDayDossierPdf } from "../../domain/services/day-dossier-pdf.js";
import { SPECIMEN_ORDER, specimenServiceDay } from "../document-specimens/specimen-data.js";
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
 * rayon, un bon par commande avec sa pastille, le BL de transport d'exemple
 * derrière le premier, un bon de réassort — sans
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
    private readonly logo: BrandLogoSource,
    private readonly deliveryNote: SpecimenDeliveryNoteReader,
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
      {
        logo: await this.logo.load(),
        colisageUrlOf: (reference) =>
          base === null ? "" : `${base}/colisage/${encodeURIComponent(reference)}`,
        colors: SPECIMEN_DAY_COLORS,
        resupplyColors: SPECIMEN_DAY_RESUPPLY_COLORS,
        // Le BL de transport de la planche, derrière le premier bon seulement :
        // il ne décrit aucune des commandes d'exemple, le répéter le ferait croire.
        deliveryNotes: new Map([
          [SPECIMEN_ORDER.orderId, await this.deliveryNote.specimenDrawing(now)],
        ]),
      },
    );
    return { bytes, fileName: "exemple-dossier-du-jour.pdf" };
  }
}
