import type { OrderRevisionEntryView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import {
  OrderRevisionHistoryReader,
  type RecordedOrderRevision,
} from "../../domain/ports/order-revision-history.reader.js";
import { ListOrderRevisionsQuery } from "./list-order-revisions.query.js";

/**
 * Sert l'historique des révisions d'une commande, la plus récente en tête.
 * L'auteur staff est nommé par l'annuaire du staff (`null` s'il n'y est plus,
 * jamais un nom inventé). Une commande inconnue est un 404 — le même
 * `OrderNotFoundError` que le détail.
 */
@QueryHandler(ListOrderRevisionsQuery)
export class ListOrderRevisionsHandler implements IQueryHandler<
  ListOrderRevisionsQuery,
  readonly OrderRevisionEntryView[]
> {
  constructor(
    private readonly history: OrderRevisionHistoryReader,
    private readonly staff: StaffAuthorDirectory,
  ) {}

  async execute(query: ListOrderRevisionsQuery): Promise<readonly OrderRevisionEntryView[]> {
    const revisions = await this.history.historyOf(query.orderId);
    if (revisions === null) {
      throw new OrderNotFoundError(query.orderId);
    }
    const staffAuthors = await this.staff.identify(
      revisions.map((revision) =>
        revision.author.kind === "staff" ? revision.author.staffId : null,
      ),
    );
    return revisions.map((revision) => viewOf(revision, (id) => staffAuthors.nameOf(id)));
  }
}

function viewOf(
  revision: RecordedOrderRevision,
  staffName: (staffId: string | null) => string | null,
): OrderRevisionEntryView {
  const { author } = revision;
  return {
    replacedRevision: revision.replacedRevision,
    revisedAt: revision.revisedAt.toISOString(),
    author:
      author.kind === "staff"
        ? { kind: "staff", name: staffName(author.staffId) }
        : { kind: "customer", name: author.name },
    changes: revision.changes,
    totalBeforeCents: revision.totalBeforeCents,
    totalAfterCents: revision.totalAfterCents,
    replaced: revision.replaced,
  };
}
