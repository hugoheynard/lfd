import type { SubAccountNoticeKind } from "@lfd/contracts";

import type { CompanyRole } from "../value-objects/company-role.js";

/** Une cellule du tableau action × rôle que le staff a fait déroger au défaut. */
export interface SubAccountNoticeRuleOverride {
  readonly kind: SubAccountNoticeKind;
  readonly role: CompanyRole;
  readonly enabled: boolean;
}

/**
 * **Les dérogations du tableau des avis d'un principal**
 * (`plan-notifications-sous-comptes.md`, §3). Ne rend que ce qui déroge :
 * composer avec le défaut est le travail du domaine des avis, pur.
 */
export abstract class SubAccountNoticeRulesReader {
  abstract overridesOf(principalId: string): Promise<readonly SubAccountNoticeRuleOverride[]>;
}
