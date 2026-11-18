import type { BudgetCommitmentRequirementsView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { ActingCompany } from "../../../platform/auth/acting-company.decorator.js";
import { GetBudgetCommitmentRequirementsQuery } from "../application/queries/get-budget-commitment-requirements.query.js";

/**
 * **Le panier d'un organisme public** — `GET /me/budget-commitment-requirements` :
 * ce que le payeur de la société active exige (numéro d'engagement, code
 * service et son défaut), pour afficher les champs. La société vient du
 * contexte de la requête, jamais de l'URL.
 */
@Controller("me/budget-commitment-requirements")
export class MyBudgetCommitmentRequirementsController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  requirements(
    @ActingCompany() companyId: string | null,
  ): Promise<BudgetCommitmentRequirementsView> {
    return this.queries.execute<
      GetBudgetCommitmentRequirementsQuery,
      BudgetCommitmentRequirementsView
    >(new GetBudgetCommitmentRequirementsQuery(companyId));
  }
}
