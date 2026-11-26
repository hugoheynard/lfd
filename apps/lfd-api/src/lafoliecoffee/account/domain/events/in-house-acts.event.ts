import type { JournalFactType } from "@lfd/contracts/journal-facts";

import { ACCOUNT_FACTS } from "./account-facts.js";
import type { NamedRef } from "./journal-names.js";
import { CompanyStaffAct } from "./staff-acts.event.js";

/** L'équipe a marqué la société « maison » : un de nos restaurants. */
export class InHouseDeclaredEvent extends CompanyStaffAct {
  constructor(company: NamedRef) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.inHouseDeclared;
  }
}

/** L'équipe a retiré la nature « maison » : les commandes suivantes sont facturées. */
export class InHouseWithdrawnEvent extends CompanyStaffAct {
  constructor(company: NamedRef) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.inHouseWithdrawn;
  }
}
