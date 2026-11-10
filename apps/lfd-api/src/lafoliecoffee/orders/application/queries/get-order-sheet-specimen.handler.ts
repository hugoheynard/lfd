import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { OrderMailOrigins } from "../../domain/ports/order-mail-origins.js";
import { OrderSheetLogoSource } from "../../domain/ports/order-sheet-logo.source.js";
import { handoverUrlOf } from "../../domain/services/handover-url.js";
import { renderOrderSheetPdf } from "../../domain/services/order-sheet-pdf.js";
import { specimenClientSheet } from "../document-specimens/specimen-data.js";
import type { OrderSheetPdf } from "../services/order-sheet-archive.service.js";
import { GetOrderSheetSpecimenQuery } from "./get-order-sheet-specimen.query.js";

/**
 * Le jeton imprimé dans le QR du bon public d'exemple. Il ne désigne aucune
 * commande : scanné, il mène au comptoir, qui répond « retrait introuvable ».
 * Il est là pour qu'on CONTRÔLE la place et la taille du code sur le papier.
 */
const SPECIMEN_HANDOVER_TOKEN = "EXEMPLE";

/**
 * **Rend le bon d'exemple** par le rendu même des vraies commandes
 * (`renderOrderSheetPdf`) — et ne passe PAS par `OrderSheetArchive` : un
 * exemple ne se range pas sous la clé d'une commande.
 *
 * La couleur de catégorie reste nulle : elle se lit sur une vraie commande, et
 * en inventer une ferait passer un réglage pour un autre.
 */
@QueryHandler(GetOrderSheetSpecimenQuery)
export class GetOrderSheetSpecimenHandler implements IQueryHandler<
  GetOrderSheetSpecimenQuery,
  OrderSheetPdf
> {
  constructor(
    private readonly clock: Clock,
    private readonly logo: OrderSheetLogoSource,
    private readonly origins: OrderMailOrigins,
  ) {}

  async execute(query: GetOrderSheetSpecimenQuery): Promise<OrderSheetPdf> {
    const sheet = specimenClientSheet(query.variant, this.clock.now());
    const handoverUrl =
      sheet.fulfillment.method === "pickup"
        ? handoverUrlOf(this.origins.adminBaseUrl(), SPECIMEN_HANDOVER_TOKEN)
        : "";
    const bytes = await renderOrderSheetPdf(sheet, {
      logo: await this.logo.load(),
      categoryColor: null,
      handoverUrl,
    });
    return { bytes, fileName: `exemple-confirmation-de-commande-${query.variant}.pdf` };
  }
}
