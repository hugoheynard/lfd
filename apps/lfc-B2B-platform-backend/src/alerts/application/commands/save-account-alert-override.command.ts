import type { AccountAlertOverride } from "@lfd/contracts";

/** Commande **staff** : faire déroger un compte à une règle globale. */
export class SaveAccountAlertOverrideCommand {
  constructor(
    readonly companyId: string,
    readonly override: AccountAlertOverride,
    /** Le `sub` du staff qui déroge — « qui a coupé les alertes ici ? ». */
    readonly staffSub: string,
  ) {}
}
