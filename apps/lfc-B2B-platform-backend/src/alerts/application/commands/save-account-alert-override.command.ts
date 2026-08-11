import type { AccountAlertOverride } from "@lfd/contracts";

/** Commande **staff** : faire déroger un compte à une règle globale. */
export class SaveAccountAlertOverrideCommand {
  constructor(
    readonly companyId: string,
    readonly override: AccountAlertOverride,
  ) {}
}
