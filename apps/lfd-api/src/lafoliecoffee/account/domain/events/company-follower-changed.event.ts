import type { JournalFactType } from "@lfd/contracts/journal-facts";

import { ACCOUNT_FACTS } from "./account-facts.js";
import type { NamedRef, PersonRef } from "./journal-names.js";
import { CompanyStaffAct } from "./staff-acts.event.js";

/**
 * Le suivi commercial d'une fiche change de mains : confié, réattribué ou
 * retiré (`null` d'un côté). Les deux personnes sont citées avec leur nom du
 * moment — un commercial parti depuis se lit encore sous son nom.
 *
 * Celui qui décide n'est pas dans la charge : il est l'acteur de la ligne.
 */
export class CompanyFollowerChangedEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly before: PersonRef | null,
    readonly after: PersonRef | null,
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.companyFollowerChanged;
  }
  protected override details(): Record<string, unknown> {
    return { before: this.before, after: this.after };
  }
}
