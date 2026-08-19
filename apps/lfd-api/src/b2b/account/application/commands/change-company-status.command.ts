import type { CompanyStatusAction } from "@lfd/contracts";

/** Suspension, réactivation ou résiliation d'un compte, par le staff. */
export class ChangeCompanyStatusCommand {
  constructor(
    readonly companyId: string,
    readonly action: CompanyStatusAction,
    readonly reason: string,
  ) {}
}
