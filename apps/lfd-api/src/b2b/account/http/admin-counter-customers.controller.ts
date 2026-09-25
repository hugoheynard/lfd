import type { CounterCustomerCard, CounterCustomerView } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { GetCounterCustomerQuery } from "../application/queries/get-counter-customer.query.js";
import { ListCounterCustomersQuery } from "../application/queries/list-counter-customers.query.js";

/**
 * Surface du **Comptoir** : ce qu'un vendeur voit d'un client pour lui prendre
 * une commande (`documentation/order/plan-commande-au-comptoir.md`).
 *
 * Elle vit dans `account` parce que la société y vit. Elle déclare pourtant
 * `b2b_counter`, pas `b2b_companies` : la fiche client — crédit, KBIS,
 * contacts, conditions — reste fermée à qui n'a que le Comptoir. La passation
 * ne passe pas ici : elle reste `POST /admin/orders`, sous `b2b_orders:write`.
 */
@Controller("admin/counter/customers")
@AdminSurface("b2b_counter")
export class AdminCounterCustomersController {
  constructor(private readonly queries: QueryBus) {}

  /** Les cartes de recherche des clients actifs. */
  @Get()
  list(): Promise<readonly CounterCustomerCard[]> {
    return this.queries.execute<ListCounterCustomersQuery, readonly CounterCustomerCard[]>(
      new ListCounterCustomersQuery(),
    );
  }

  /** Le détail d'un client actif — 404 s'il est inconnu ou non actif. */
  @Get(":companyId")
  one(@Param("companyId") companyId: string): Promise<CounterCustomerView> {
    return this.queries.execute<GetCounterCustomerQuery, CounterCustomerView>(
      new GetCounterCustomerQuery(companyId),
    );
  }
}
