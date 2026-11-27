import type { AdminOrderRow, AdminOrdersPage } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { InscribedOrdersReader } from "../../../../production/channels/commerce/index.js";
import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { OrderReviewListNotReadableError } from "../../domain/errors/admin-order-list-errors.js";
import { AdminOrderListReader } from "../../domain/ports/admin-order-list.reader.js";
import { CurrentOrderReviewsReader } from "../../domain/ports/order-reviews.reader.js";
import { AdminOrderCursor } from "../../domain/value-objects/admin-order-cursor.js";
import { adminOrderListCriteriaOf } from "./admin-order-list-criteria.js";
import { ListAdminOrdersQuery } from "./list-admin-orders.query.js";

/**
 * Sert une page de la liste staff des commandes (forme déjà validée par le
 * contrôleur). Le curseur suivant désigne la DERNIÈRE ligne rendue, et n'existe
 * que si le lecteur a vu au-delà.
 *
 * Chaque ligne porte son visa en cours, nommé par l'annuaire : une lecture
 * des visas et une de l'annuaire pour la page, jamais une par ligne.
 *
 * Une commande que le fournil a déjà inscrite n'est plus « hors plan », même
 * si le commerce la tient encore `placed` (un retirage ne la confirme pas) :
 * une lecture du fournil pour les seules lignes hors plan de la page.
 *
 * @throws {OrderReviewListNotReadableError} `to_review` sans `b2b_order_review:read`.
 */
@QueryHandler(ListAdminOrdersQuery)
export class ListAdminOrdersHandler implements IQueryHandler<
  ListAdminOrdersQuery,
  AdminOrdersPage
> {
  constructor(
    private readonly orders: AdminOrderListReader,
    private readonly reviews: CurrentOrderReviewsReader,
    private readonly staff: StaffAuthorDirectory,
    private readonly inscribed: InscribedOrdersReader,
  ) {}

  async execute(query: ListAdminOrdersQuery): Promise<AdminOrdersPage> {
    if (query.filters.view === "to_review" && !query.mayReadReviews) {
      throw new OrderReviewListNotReadableError();
    }
    const slice = await this.orders.page(adminOrderListCriteriaOf(query.filters));
    const last = slice.rows.at(-1);
    return {
      rows: await this.withReviews(await this.withoutInscribedOffPlan(slice.rows)),
      nextCursor:
        slice.hasMore && last !== undefined
          ? AdminOrderCursor.after(new Date(last.placedAt), last.id).encode()
          : null,
      total: slice.total,
    };
  }

  private async withoutInscribedOffPlan(
    rows: readonly AdminOrderRow[],
  ): Promise<readonly AdminOrderRow[]> {
    const offPlan = rows.filter((row) => row.offPlan).map((row) => row.id);
    if (offPlan.length === 0) {
      return rows;
    }
    const inscribed = await this.inscribed.inscribedAmong(offPlan);
    return rows.map((row) =>
      row.offPlan && inscribed.has(row.id) ? { ...row, offPlan: false } : row,
    );
  }

  private async withReviews(rows: readonly AdminOrderRow[]): Promise<AdminOrderRow[]> {
    const current = await this.reviews.of(rows.map((row) => row.id));
    const authors = await this.staff.identify(
      [...current.values()].map((review) => review.reviewedByStaffId),
    );
    return rows.map((row) => {
      const review = current.get(row.id);
      return {
        ...row,
        review:
          review === undefined
            ? null
            : {
                byName: authors.nameOf(review.reviewedByStaffId),
                at: review.reviewedAt.toISOString(),
              },
        revisedSinceReview: review?.revisedSinceReview ?? false,
      };
    });
  }
}
