import type { BudgetCommitmentRequirementsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { OrderCompanyNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderPayerReader } from "../../domain/ports/order-payer.reader.js";
import { PayerCommitmentRequirements } from "../../domain/ports/payer-commitment-requirements.js";
import { GetBudgetCommitmentRequirementsQuery } from "./get-budget-commitment-requirements.query.js";

const NO_PAYER: BudgetCommitmentRequirementsView = {
  payerCompanyId: null,
  publicPayer: false,
  commitmentRequired: false,
  serviceCodeRequired: false,
  defaultServiceCode: "",
};

/**
 * Le payeur que la passation retiendrait (le principal d'un site qui suit sa
 * facturation, sinon la société), et ce que sa fiche Chorus exige. Une
 * lecture d'affichage : le refus d'un payeur suspendu reste à la passation.
 *
 * @throws {OrderCompanyNotFoundError} la société n'existe pas.
 */
@QueryHandler(GetBudgetCommitmentRequirementsQuery)
export class GetBudgetCommitmentRequirementsHandler implements IQueryHandler<
  GetBudgetCommitmentRequirementsQuery,
  BudgetCommitmentRequirementsView
> {
  constructor(
    private readonly payers: OrderPayerReader,
    private readonly requirements: PayerCommitmentRequirements,
    private readonly clock: Clock,
  ) {}

  async execute(
    query: GetBudgetCommitmentRequirementsQuery,
  ): Promise<BudgetCommitmentRequirementsView> {
    if (query.companyId === null) {
      return NO_PAYER;
    }
    const standing = await this.payers.standingAt(query.companyId, this.clock.now());
    if (standing === null) {
      throw new OrderCompanyNotFoundError(query.companyId);
    }
    const payerCompanyId = standing.billingFollow?.payerId ?? standing.companyId;
    const terms = await this.requirements.of(payerCompanyId);
    return terms.kind === "private"
      ? { ...NO_PAYER, payerCompanyId }
      : {
          payerCompanyId,
          publicPayer: true,
          commitmentRequired: terms.commitmentRequired,
          serviceCodeRequired: terms.serviceCodeRequired,
          defaultServiceCode: terms.defaultServiceCode,
        };
  }
}
