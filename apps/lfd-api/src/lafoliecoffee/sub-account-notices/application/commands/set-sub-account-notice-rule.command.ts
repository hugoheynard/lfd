import type { SubAccountNoticeKind } from "@lfd/contracts";

import type { CompanyRole } from "../../../account/domain/value-objects/company-role.js";

/** Commande **staff** : régler une cellule du tableau des avis d'un principal. */
export class SetSubAccountNoticeRuleCommand {
  constructor(
    readonly principalId: string,
    readonly kind: SubAccountNoticeKind,
    readonly role: CompanyRole,
    readonly enabled: boolean,
    /** L'id de fiche du staff — « qui a coupé ces avis ? ». */
    readonly staffId: string,
  ) {}
}
