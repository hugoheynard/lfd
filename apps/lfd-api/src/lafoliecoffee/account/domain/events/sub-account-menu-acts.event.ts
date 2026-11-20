import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { SubAccountMenu } from "../entities/sub-account-menu.js";
import type { MenuAuthor } from "../value-objects/sub-account-menu-terms.js";
import { ACCOUNT_FACTS } from "./account-facts.js";
import type { NamedRef } from "./journal-names.js";
import { CompanyStaffAct } from "./staff-acts.event.js";

/**
 * **La carte d'un sous-compte est posée** (`plan-carte-des-sites.md`, § 4) —
 * un geste sur le compte d'un AUTRE que son auteur, qu'il vienne du staff ou
 * du principal : d'où la forme des actes du staff. Le sujet est le
 * sous-compte.
 *
 * `author` n'entre pas dans la charge (la ligne du journal porte déjà
 * l'auteur) : il est sur l'événement pour ses abonnés — l'avis au principal
 * quand c'est le staff qui change la carte (Q3) s'y décidera.
 */
export class SubAccountMenuSetEvent extends CompanyStaffAct {
  readonly author: MenuAuthor;
  private readonly mode: string;
  private readonly offMenu: string;
  private readonly included: number;
  private readonly excluded: number;

  constructor(company: NamedRef, menu: SubAccountMenu) {
    super(company);
    this.author = menu.stamp.author;
    this.mode = menu.mode;
    this.offMenu = menu.offMenu;
    this.included = menu.entries.filter((entry) => entry.effect === "include").length;
    this.excluded = menu.entries.length - this.included;
  }

  protected type(): JournalFactType {
    return ACCOUNT_FACTS.subAccountMenuSet;
  }

  protected override details(): Record<string, unknown> {
    return {
      mode: this.mode,
      offMenu: this.offMenu,
      included: this.included,
      excluded: this.excluded,
    };
  }
}
