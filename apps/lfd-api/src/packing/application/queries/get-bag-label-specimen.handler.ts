import type { PackingBagLabelsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BrandLogoSource } from "../../../platform/brand/brand-logo.source.js";
import { AppConfig } from "../../../platform/config/app-config.js";
import { Clock } from "../../../platform/time/clock.js";
import { renderBagLabelsPdf } from "../../domain/services/bag-labels-pdf.js";
import type { BagLabelsFile } from "../containers/get-bag-labels-pdf.handler.js";
import { GetBagLabelSpecimenQuery } from "./get-bag-label-specimen.query.js";

/** Une commande d'exemple : deux sacs, un retrait pro, une couleur posée. */
function specimenLabels(handoverUrl: string): PackingBagLabelsView {
  return {
    orderId: "ord_exemple",
    reference: "ORD-0123",
    customerLabel: "Le Bistrot du Village",
    fulfillmentLabel: "Retrait Village · pro",
    when: "8 h 00 – 10 h 00",
    color: "#2E7D5B",
    handoverUrl,
    bags: [
      { containerId: "c_1", label: "Sac 1", rank: 1, of: 2 },
      { containerId: "c_2", label: "Sac 2", rank: 2, of: 2 },
    ],
  };
}

/**
 * **Rend l'étiquette de sac d'exemple** par le rendu même des vraies
 * (`renderBagLabelsPdf`) — deux feuilles, « Sac 1/2 » et « Sac 2/2 ».
 *
 * Le QR a la forme d'un vrai QR de retrait (`<origine>/retrait/<jeton>`) sur
 * un jeton qui n'existe pas : scanné, il n'ouvre rien. Il est là pour qu'on
 * contrôle sa place et sa taille sur l'étiquette.
 */
@QueryHandler(GetBagLabelSpecimenQuery)
export class GetBagLabelSpecimenHandler implements IQueryHandler<
  GetBagLabelSpecimenQuery,
  BagLabelsFile
> {
  constructor(
    private readonly clock: Clock,
    private readonly config: AppConfig,
    private readonly logo: BrandLogoSource,
  ) {}

  async execute(): Promise<BagLabelsFile> {
    const base = this.config.adminBaseUrl();
    const labels = specimenLabels(base === null ? "" : `${base}/retrait/exemple`);
    const bytes = await renderBagLabelsPdf(labels, labels.bags, {
      printedAt: this.clock.now(),
      logo: await this.logo.load(),
    });
    return { bytes, fileName: "exemple-etiquette-de-sac.pdf" };
  }
}
