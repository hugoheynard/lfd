import type { CustomerLookupView } from "@lfd/contracts";
import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { FindCustomerByEmailQuery } from "../application/queries/find-customer-by-email.query.js";

/**
 * Les **personnes** côté staff — distinct de `admin/companies`, qui parle de
 * sociétés. Une personne peut en détenir plusieurs ; la ranger sous l'une d'elles
 * ferait croire qu'elle lui appartient.
 *
 * ⚠️ Ces routes disent si une adresse est connue de la plateforme, et avec
 * quelles sociétés. D'où la porte staff : ouvertes, elles permettraient
 * d'énumérer le fichier client une adresse à la fois.
 */
@Controller("admin/customers")
@Public()
@UseGuards(AdminAuthGuard)
export class AdminCustomersController {
  constructor(private readonly queries: QueryBus) {}

  /**
   * Ce qu'on sait déjà de la personne portant cette adresse — `null` si elle nous
   * est inconnue, ce qui est le cas le plus fréquent et **pas** une erreur.
   *
   * Se lit **avant** d'ouvrir un compte : un même client peut détenir plusieurs
   * établissements, et la nouvelle société doit alors rejoindre son espace plutôt
   * que lui en créer un second.
   */
  @Get("by-email")
  findByEmail(@Query("email") email?: string): Promise<CustomerLookupView | null> {
    return this.queries.execute<FindCustomerByEmailQuery, CustomerLookupView | null>(
      new FindCustomerByEmailQuery(email ?? ""),
    );
  }
}
