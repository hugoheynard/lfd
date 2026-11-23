import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { CompanySalesIdentityReader } from "../../../account/domain/ports/company-sales-identity.reader.js";
import { IssuedCreditNotesReader } from "../../../accounting/domain/ports/issued-credit-notes.reader.js";
import { CategoryNamesReader } from "../../../catalog/domain/ports/category-names.reader.js";
import { SalesExportReader } from "../../../orders/domain/ports/sales-export.reader.js";
import { SucceededCardRefundsReader } from "../../../../payment/channels/requests/index.js";
import { SalesPeriod } from "../../domain/value-objects/sales-period.js";
import { GetSalesExportQuery } from "./get-sales-export.query.js";
import { creditNoteViewOf, lineViewOf, orderViewOf } from "./sales-export-orders.mapping.js";
import { summaryViewOf } from "./sales-export-summary.mapping.js";
import {
  distinct,
  namedCompanyOf,
  refundsByOrderOf,
  type SalesExportLookups,
} from "./sales-export.lookups.js";
import type { SalesExportView } from "./sales-export.view.js";

/** Le sujet sous lequel `payment` range l'argent rendu d'une commande. */
const ORDER_SUBJECT = "order";

/**
 * **L'export des ventes d'une période** — compose les lectures publiées par
 * leurs propriétaires (commandes, avoirs, familles, sociétés, remboursements)
 * sans lire aucune de leurs tables (CLAUDE.md § 3, « le propriétaire parle de
 * ce qui est à lui »). Chaque lecture est appelée UNE fois pour toute la
 * période, par lot, jamais par commande : deux temps, parce que les familles,
 * les sociétés et les remboursements se demandent pour les identifiants que
 * les commandes et les avoirs ont rendus.
 *
 * Lecture pure : n'écrit rien, pas même un compteur.
 *
 * @throws {UnreadableSalesPeriodDayError | InvertedSalesPeriodError | TooLongSalesPeriodError}
 *   la période n'est pas servable.
 */
@QueryHandler(GetSalesExportQuery)
export class GetSalesExportHandler implements IQueryHandler<GetSalesExportQuery, SalesExportView> {
  constructor(
    private readonly sales: SalesExportReader,
    private readonly creditNotes: IssuedCreditNotesReader,
    private readonly categories: CategoryNamesReader,
    private readonly companies: CompanySalesIdentityReader,
    private readonly refunds: SucceededCardRefundsReader,
  ) {}

  async execute(query: GetSalesExportQuery): Promise<SalesExportView> {
    const period = SalesPeriod.of(query.from, query.to);
    const [orders, notes] = await Promise.all([
      this.sales.placedBetween(period.from, period.to),
      this.creditNotes.issuedBetween(period.from, period.to),
    ]);
    const [families, identities, refunds] = await Promise.all([
      this.categories.namesOf(distinct(orders.flatMap((o) => o.lines.map((l) => l.categoryId)))),
      this.companies.identitiesOf(
        distinct([...orders.map(namedCompanyOf), ...notes.map((note) => note.payerCompanyId)]),
      ),
      this.refunds.succeededOf(
        ORDER_SUBJECT,
        orders.map((order) => order.orderId),
      ),
    ]);
    const lookups: SalesExportLookups = {
      familyNames: new Map(families.map((family) => [family.id, family.name])),
      companies: new Map(identities.map((identity) => [identity.companyId, identity])),
      refundsByOrder: refundsByOrderOf(refunds),
    };
    return {
      orders: orders.map((order) => orderViewOf(order, lookups)),
      lines: orders.flatMap((order) =>
        order.lines.map((line) => lineViewOf(order.orderNumber, line, lookups.familyNames)),
      ),
      creditNotes: notes.map((note) => creditNoteViewOf(note, lookups)),
      summary: summaryViewOf(period.days, orders, notes, lookups),
    };
  }
}
