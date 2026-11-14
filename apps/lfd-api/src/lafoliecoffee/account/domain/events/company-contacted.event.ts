import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { NotedContact } from "../value-objects/noted-contact.js";
import { ACCOUNT_FACTS } from "./account-facts.js";
import type { NamedRef } from "./journal-names.js";
import { CompanyStaffAct } from "./staff-acts.event.js";

/**
 * Un membre de l'équipe a noté un échange avec la société : le fait qui date
 * la montée vers « Contactée » du suivi commercial.
 *
 * L'auteur n'est pas dans la charge : il est l'acteur de la ligne de journal,
 * comme pour tous les actes du staff. La note ne part que si elle existe.
 */
export class CompanyContactedEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly contact: NotedContact,
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.companyContacted;
  }
  protected override details(): Record<string, unknown> {
    const { mode, date, note } = this.contact;
    return note === null ? { mode, date } : { mode, date, note };
  }
}
