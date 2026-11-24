import type { BudgetCommitmentRequirementsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { OrderCompanyNotFoundError } from "../../domain/errors/order-errors.js";
import {
  OrderingChorusServiceReader,
  type OrderingChorusService,
} from "../../domain/ports/ordering-chorus-service.reader.js";
import { OrderPayerReader } from "../../domain/ports/order-payer.reader.js";
import { PayerCommitmentRequirements } from "../../domain/ports/payer-commitment-requirements.js";
import { GetBudgetCommitmentRequirementsQuery } from "./get-budget-commitment-requirements.query.js";

const NO_PAYER: BudgetCommitmentRequirementsView = {
  payerCompanyId: null,
  publicPayer: false,
  commitmentRequired: false,
  serviceCodeRequired: false,
  defaultServiceCode: "",
  timing: "at_order",
  currentCommitment: null,
};

/**
 * Le payeur que la passation retiendrait (le principal d'un site qui suit sa
 * facturation, sinon la société), et ce que sa fiche Chorus exige. Une
 * lecture d'affichage : le refus d'un payeur suspendu reste à la passation.
 *
 * La fiche du service de la société qui commande propose son code service
 * (avant celui du payeur) et son engagement en cours. Elle est écartée quand
 * elle a été posée pour un autre payeur : un sous-compte qui a changé de
 * principal ne propose pas l'engagement d'un autre SIRET.
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
    private readonly services: OrderingChorusServiceReader,
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
    if (terms.kind === "private") {
      return { ...NO_PAYER, payerCompanyId };
    }
    const service = await this.serviceFor(query.companyId, payerCompanyId);
    return {
      payerCompanyId,
      publicPayer: true,
      commitmentRequired: terms.commitmentRequired,
      serviceCodeRequired: terms.serviceCodeRequired,
      defaultServiceCode:
        service === null || service.serviceCode === ""
          ? terms.defaultServiceCode
          : service.serviceCode,
      timing: terms.timing,
      // Sur devis de période, rien n'est prérempli : le numéro vient du devis.
      currentCommitment:
        terms.timing === "on_period_quote" ? null : (service?.currentCommitment ?? null),
    };
  }

  /** La fiche du service de la société, si elle a été posée pour ce payeur. */
  private async serviceFor(
    companyId: string,
    payerCompanyId: string,
  ): Promise<OrderingChorusService | null> {
    const service = await this.services.of(companyId);
    return service !== null && service.payerCompanyId === payerCompanyId ? service : null;
  }
}
