import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BrandLogoSource } from "../../../platform/brand/brand-logo.source.js";
import { AppConfig } from "../../../platform/config/app-config.js";
import { Clock } from "../../../platform/time/clock.js";
import { type BinLabelsPaper, renderBinLabelsPdf } from "../../domain/services/bin-labels-pdf.js";
import type { BinLabelsFile } from "../bin-labels-print.js";
import { GetBinLabelSpecimenQuery } from "./get-bin-label-specimen.query.js";

/**
 * Une commande d'exemple en tournée : un bac entier, et une moitié partagée
 * avec un voisin d'arrêt, deux sacs dedans — tout ce qu'une étiquette sait
 * dire.
 */
function specimenPaper(base: string | null, printedAt: Date): BinLabelsPaper {
  const qr = (binId: string): string => (base === null ? "" : `${base}/livraison/bac/${binId}`);
  const common = { reference: "ORD-0123", customerLabel: "Le Bistrot du Village" };
  return {
    title: "ORD-0123",
    round: { title: "Camion 1 · passage 2", stop: 4 },
    color: "#C2410C",
    printedAt,
    labels: [
      {
        ...common,
        indexLabel: "bac 1 / 2",
        kind: "Bac M",
        sharedWith: null,
        innerBags: null,
        code: "7KQ2MX",
        qrUrl: qr("bin_exemple_1"),
      },
      {
        ...common,
        indexLabel: "bac 2 / 2",
        kind: "Bac L isotherme · ½ gauche",
        sharedWith: "partagé avec ORD-0124 · La Cantine",
        innerBags: "2 sacs dedans",
        code: "R4TB9C",
        qrUrl: qr("bin_exemple_2"),
      },
    ],
  };
}

/**
 * **Rend l'étiquette de bac d'exemple** par le rendu même des vraies
 * (`renderBinLabelsPdf`). Les QR ont la forme d'un vrai QR de bac sur des
 * identifiants qui n'existent pas : scannés, ils n'ouvrent rien.
 */
@QueryHandler(GetBinLabelSpecimenQuery)
export class GetBinLabelSpecimenHandler implements IQueryHandler<
  GetBinLabelSpecimenQuery,
  BinLabelsFile
> {
  constructor(
    private readonly clock: Clock,
    private readonly config: AppConfig,
    private readonly logo: BrandLogoSource,
  ) {}

  async execute(): Promise<BinLabelsFile> {
    const paper = specimenPaper(this.config.adminBaseUrl(), this.clock.now());
    const bytes = await renderBinLabelsPdf(paper, await this.logo.load());
    return { bytes, fileName: "exemple-etiquette-de-bac.pdf" };
  }
}
