import type { PaymentLinkView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  StaffAuthorDirectory,
  type StaffAuthors,
} from "../../../../staff/directory/domain/staff-author-directory.js";
import {
  PaymentLinkReader,
  type PaymentLinkEntry,
} from "../../domain/ports/payment-link.reader.js";
import { ListPaymentLinksQuery } from "./list-payment-links.query.js";

/**
 * Les liens libres, auteurs nommés par l'annuaire — en une lecture pour toute
 * la liste, pas une par ligne. Une fiche inconnue rend `null`, jamais un nom
 * inventé.
 */
@QueryHandler(ListPaymentLinksQuery)
export class ListPaymentLinksHandler implements IQueryHandler<
  ListPaymentLinksQuery,
  readonly PaymentLinkView[]
> {
  constructor(
    private readonly reader: PaymentLinkReader,
    private readonly authors: StaffAuthorDirectory,
  ) {}

  async execute(): Promise<readonly PaymentLinkView[]> {
    const entries = await this.reader.list();
    const authors = await this.authors.identify(
      entries.flatMap((entry) => [entry.createdByStaffId, entry.cancelledByStaffId]),
    );
    return entries.map((entry) => toView(entry, authors));
  }
}

function toView(entry: PaymentLinkEntry, authors: StaffAuthors): PaymentLinkView {
  return {
    id: entry.id,
    companyId: entry.companyId,
    companyName: entry.companyName,
    amountCents: entry.amountCents,
    label: entry.label,
    status: entry.status,
    url: entry.url,
    createdAt: entry.createdAt.toISOString(),
    createdByName: authors.nameOf(entry.createdByStaffId),
    paidAt: entry.paidAt?.toISOString() ?? null,
    cancelledAt: entry.cancelledAt?.toISOString() ?? null,
    cancelledByName: authors.nameOf(entry.cancelledByStaffId),
  };
}
