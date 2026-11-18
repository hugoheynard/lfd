import { PayerCommitmentRequirements } from "../../../domain/ports/payer-commitment-requirements.js";
import {
  PRIVATE_PAYER,
  type PayerCommitmentTerms,
} from "../../../domain/services/budget-commitment-rule.js";

/**
 * Ce que les payeurs exigent de l'engagement budgétaire, doublé à la main :
 * tous privés, sauf ceux qu'on lui décrit. Hérite du port abstrait.
 */
export class FixedCommitmentTerms extends PayerCommitmentRequirements {
  readonly asked: string[] = [];

  constructor(private readonly terms: ReadonlyMap<string, PayerCommitmentTerms> = new Map()) {
    super();
  }

  of(payerCompanyId: string): Promise<PayerCommitmentTerms> {
    this.asked.push(payerCompanyId);
    return Promise.resolve(this.terms.get(payerCompanyId) ?? PRIVATE_PAYER);
  }
}
