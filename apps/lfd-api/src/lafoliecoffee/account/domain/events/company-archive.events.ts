import type { JournalFactType } from "@lfd/contracts/journal-facts";

import { ACCOUNT_FACTS } from "./account-facts.js";
import type { NamedRef } from "./journal-names.js";
import { CompanyStaffAct } from "./staff-acts.event.js";

/**
 * L'équipe a supprimé (archivé) un compte qui n'a jamais commandé. Le motif
 * part dans la charge : c'est lui qu'on relit avant de rendre le compte.
 */
export class CompanyArchivedEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly reason: string,
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.archived;
  }
  protected override details(): Record<string, unknown> {
    return { reason: this.reason };
  }
}

/** L'équipe a rendu un compte supprimé ; son statut n'a pas bougé. */
export class CompanyUnarchivedEvent extends CompanyStaffAct {
  constructor(company: NamedRef) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.unarchived;
  }
}
