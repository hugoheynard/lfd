import type { AdminOrderView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { AdminOrderAuthorReader } from "../../domain/ports/admin-order-author.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { GetAdminOrderQuery } from "./get-admin-order.query.js";

/**
 * Sert une commande au staff, avec QUI l'a passée — la personne, sa société,
 * et le membre de l'équipe qui l'a saisie le cas échéant. Le 404 reste **non
 * divulguant** par cohérence de message, même si ici il n'y a rien à cacher :
 * c'est le même `OrderNotFoundError` des deux côtés, donc le même texte à
 * l'écran.
 */
@QueryHandler(GetAdminOrderQuery)
export class GetAdminOrderHandler implements IQueryHandler<GetAdminOrderQuery, AdminOrderView> {
  constructor(
    private readonly orders: OrderReader,
    private readonly authors: AdminOrderAuthorReader,
    private readonly staff: StaffAuthorDirectory,
  ) {}

  async execute(query: GetAdminOrderQuery): Promise<AdminOrderView> {
    const [owned, author] = await Promise.all([
      this.orders.findById(query.orderId),
      this.authors.authorOf(query.orderId),
    ]);
    if (owned === null || author === null) {
      throw new OrderNotFoundError(query.orderId);
    }
    const staffAuthors = await this.staff.identify([author.placedByStaffId]);
    return {
      ...owned.view,
      clientele: owned.clientele,
      placedBy: {
        customer: author.customer,
        company: author.company,
        staffName: staffAuthors.nameOf(author.placedByStaffId),
      },
    };
  }
}
