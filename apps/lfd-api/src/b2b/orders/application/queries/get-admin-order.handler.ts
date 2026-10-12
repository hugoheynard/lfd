import type { AdminOrderCancellability, AdminOrderView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderInscriptionReader } from "../../../../production/channels/commerce/index.js";
import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { AdminOrderAuthorReader } from "../../domain/ports/admin-order-author.reader.js";
import { CancellationSubjectReader } from "../../domain/ports/cancellation-subject.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import {
  cancellationBlocker,
  cancellationRefusalOf,
  cancellationStateOf,
} from "../../domain/services/order-cancellation.js";
import { GetAdminOrderQuery } from "./get-admin-order.query.js";

/**
 * Sert une commande au staff, avec QUI l'a passée — la personne, sa société,
 * et le membre de l'équipe qui l'a saisie le cas échéant. Le 404 reste **non
 * divulguant** par cohérence de message, même si ici il n'y a rien à cacher :
 * c'est le même `OrderNotFoundError` des deux côtés, donc le même texte à
 * l'écran.
 *
 * Depuis le 2026-10-12 (plan `order/plan-annulation-de-commande.md`, C3.8), il
 * dit aussi si la commande s'annule, par la MÊME règle que le geste
 * (`cancellationBlocker`), sans verrou : c'est un affichage. L'inscription au
 * fournil se demande au fournil, par son canal.
 */
@QueryHandler(GetAdminOrderQuery)
export class GetAdminOrderHandler implements IQueryHandler<GetAdminOrderQuery, AdminOrderView> {
  constructor(
    private readonly orders: OrderReader,
    private readonly authors: AdminOrderAuthorReader,
    private readonly staff: StaffAuthorDirectory,
    private readonly subjects: CancellationSubjectReader,
    private readonly inscriptions: OrderInscriptionReader,
  ) {}

  async execute(query: GetAdminOrderQuery): Promise<AdminOrderView> {
    const [owned, author, cancellability] = await Promise.all([
      this.orders.findById(query.orderId),
      this.authors.authorOf(query.orderId),
      this.cancellabilityOf(query.orderId),
    ]);
    if (owned === null || author === null || cancellability === null) {
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
      cancellability,
    };
  }

  private async cancellabilityOf(orderId: string): Promise<AdminOrderCancellability | null> {
    const [subject, inscribedDay] = await Promise.all([
      this.subjects.find(orderId),
      this.inscriptions.inscribedDayOf(orderId),
    ]);
    if (subject === null) {
      return null;
    }
    const block = cancellationBlocker(cancellationStateOf(subject, inscribedDay));
    return block === null
      ? { cancellable: true }
      : { cancellable: false, reason: cancellationRefusalOf(block) };
  }
}
