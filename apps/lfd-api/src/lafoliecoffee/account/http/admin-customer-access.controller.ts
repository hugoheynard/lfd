import type { CustomerAccessRowView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ListCustomerAccessQuery } from "../application/queries/list-customer-access.query.js";

/**
 * La page « Accès clients » : qui a un détenteur, et qui est entré.
 *
 * Sous le même droit que la liste des comptes clients (`b2b_companies`) : elle
 * n'en montre rien de plus que la fiche, sur tous les comptes à la fois. La
 * relance passe par la route des membres de la fiche, pas par ici.
 */
@Controller("admin/customer-access")
@AdminSurface("b2b_companies")
export class AdminCustomerAccessController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  list(): Promise<readonly CustomerAccessRowView[]> {
    return this.queries.execute<ListCustomerAccessQuery, readonly CustomerAccessRowView[]>(
      new ListCustomerAccessQuery(),
    );
  }
}
