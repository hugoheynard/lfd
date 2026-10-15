import type { OrderSalesTermsResponse } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { GetOrderSalesTermsQuery } from "../application/queries/get-order-sales-terms.query.js";

/**
 * **Les CGV d'une commande**, vues du staff — le texte, sa révision et le PDF
 * en vigueur à sa passation (plan `legal/plan-cgv-par-audience.md`, C4, C4′).
 *
 * Même surface que le détail de commande (`b2b_orders`, lecture par le
 * verbe) ; un contrôleur à part pour ne pas grossir `AdminOrdersController`.
 * Le PDF se télécharge par la route publique des CGV : tout dépôt a été, à son
 * heure, le PDF public en vigueur.
 */
@Controller("admin/orders")
@AdminSurface("b2b_orders")
export class AdminOrderSalesTermsController {
  constructor(private readonly queries: QueryBus) {}

  /** `salesTerms: null` pour une commande passée avant l'enregistrement de la version. */
  @Get(":id/sales-terms")
  salesTerms(@Param("id") id: string): Promise<OrderSalesTermsResponse> {
    return this.queries.execute<GetOrderSalesTermsQuery, OrderSalesTermsResponse>(
      new GetOrderSalesTermsQuery(id),
    );
  }
}
