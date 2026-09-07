import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { clientSheetOf } from "../../domain/services/order-sheet.js";
import { OrderSheetArchive, type OrderSheetPdf } from "../services/order-sheet-archive.service.js";
import { GetAdminOrderSheetPdfQuery } from "./get-admin-order-sheet-pdf.query.js";

/**
 * Sert le bon de commande au **bureau**, sans mur de société.
 *
 * Le staff voit toutes les commandes — c'est le sens de `@AdminSurface` —, donc
 * il n'y a rien à vérifier de plus ici : ajouter un contrôle de rôle
 * dupliquerait le guard, et un contrôle dupliqué finit par diverger de celui
 * qui protège vraiment.
 *
 * Tout le reste — projection, archive, rendu — est **partagé** avec la surface
 * client via `OrderSheetArchive`. Deux chemins qui écriraient sous la même clé
 * avec des règles distinctes finiraient par archiver l'un ce que l'autre relit.
 */
@QueryHandler(GetAdminOrderSheetPdfQuery)
export class GetAdminOrderSheetPdfHandler implements IQueryHandler<
  GetAdminOrderSheetPdfQuery,
  OrderSheetPdf
> {
  constructor(
    private readonly orders: OrderReader,
    private readonly archive: OrderSheetArchive,
  ) {}

  async execute(query: GetAdminOrderSheetPdfQuery): Promise<OrderSheetPdf> {
    const owned = await this.orders.findById(query.orderId);
    if (owned === null) {
      throw new OrderNotFoundError(query.orderId);
    }
    return this.archive.pdfOf(clientSheetOf(owned.view));
  }
}
