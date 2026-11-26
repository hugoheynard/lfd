import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import {
  inHouseRecapFileName,
  type InHouseRecapPdfInput,
  renderInHouseRecapPdf,
} from "../../domain/services/in-house-recap-pdf.js";
import { RecapMonth } from "../../domain/value-objects/recap-month.js";
import type { InHouseRecapPdf } from "./get-in-house-recap-document.handler.js";
import { GetInHouseRecapSpecimenQuery } from "./get-in-house-recap-specimen.query.js";

/** Le mot posé en travers du récapitulatif d'exemple, comme sur la facture d'exemple. */
const SPECIMEN_WATERMARK = "EXEMPLE";
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** Neuf heures après minuit : une remise du matin. */
const MORNING_HOURS = 9;

/**
 * Un rectificatif d'exemple du dernier mois clos : trois produits, dont un au
 * poids, et quatre BL — dont un reliquat. Les instants se lisent depuis
 * l'horloge, jamais un jour du calendrier.
 */
export function specimenInHouseRecap(now: Date): InHouseRecapPdfInput {
  const month = RecapMonth.lastClosedAt(now);
  const { from } = month.window();
  const at = (days: number) => new Date(from.getTime() + days * DAY_MS + MORNING_HOURS * HOUR_MS);
  const compact = month.key.replace("-", "");
  return {
    number: `RBL-${compact}-0002`,
    payerName: "Restaurant d'exemple",
    month: month.key,
    issuedAt: now,
    replacesNumber: `RBL-${compact}-0001`,
    lines: [
      { sku: "VIE-001-1", productName: "Croissant", saleUnit: "piece", quantity: 240 },
      { sku: "VIE-002-1", productName: "Pain au chocolat", saleUnit: "piece", quantity: 180 },
      { sku: "PAI-010-1", productName: "Pain de campagne", saleUnit: "weight", quantity: 12_500 },
    ],
    notes: [
      { number: "C-000101-BL1", handedOverAt: at(2) },
      { number: "C-000102-BL1", handedOverAt: at(9) },
      { number: "C-000102-BL2", handedOverAt: at(11) },
      { number: "C-000117-BL1", handedOverAt: at(20) },
    ],
    watermark: SPECIMEN_WATERMARK,
  };
}

/**
 * **Rend le récapitulatif d'exemple** par le rendu même des récapitulatifs
 * (`renderInHouseRecapPdf`), sans le gardien du document, qui range : un
 * exemple ne se range pas.
 */
@QueryHandler(GetInHouseRecapSpecimenQuery)
export class GetInHouseRecapSpecimenHandler implements IQueryHandler<
  GetInHouseRecapSpecimenQuery,
  InHouseRecapPdf
> {
  constructor(private readonly clock: Clock) {}

  async execute(): Promise<InHouseRecapPdf> {
    const input = specimenInHouseRecap(this.clock.now());
    const bytes = await renderInHouseRecapPdf(input);
    return { bytes, fileName: `exemple-${inHouseRecapFileName(input.number)}` };
  }
}
