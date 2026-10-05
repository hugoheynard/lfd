import type { CollectionForm, CompanyFollowAspect } from "@lfd/contracts";
import type { JournalFactType } from "@lfd/contracts/journal-facts";

import { ACCOUNT_FACTS } from "./account-facts.js";
import type { NamedRef } from "./journal-names.js";
import { CompanyStaffAct } from "./staff-acts.event.js";

/**
 * **Les actes du staff sur la hiérarchie des comptes** (plan
 * `plan-sous-comptes.md`, lot S1). Le sujet est toujours le SOUS-COMPTE ; le
 * principal est cité nommé, sous son nom du moment.
 */

/** Le lien est posé — à la création du sous-compte, ou en rattachant un client existant. */
export class ParentAttachedEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly parent: NamedRef,
    readonly via: "created" | "attached",
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.parentAttached;
  }
  protected override details(): Record<string, unknown> {
    return { parent: { ...this.parent }, via: this.via };
  }
}

/** Le lien est retiré, et avec lui les suivis en cours. */
export class ParentDetachedEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly parent: NamedRef,
    readonly closedAspects: readonly CompanyFollowAspect[],
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.parentDetached;
  }
  protected override details(): Record<string, unknown> {
    return { parent: { ...this.parent }, closedAspects: [...this.closedAspects] };
  }
}

/** Un aspect du principal est suivi à partir de `since`. */
export class ParentFollowedEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly parent: NamedRef,
    readonly aspect: CompanyFollowAspect,
    readonly since: Date,
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.parentFollowed;
  }
  protected override details(): Record<string, unknown> {
    return { parent: { ...this.parent }, aspect: this.aspect, since: this.since.toISOString() };
  }
}

/** Le suivi d'un aspect cesse à `until`. */
export class ParentUnfollowedEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly parent: NamedRef,
    readonly aspect: CompanyFollowAspect,
    readonly until: Date,
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.parentUnfollowed;
  }
  protected override details(): Record<string, unknown> {
    return { parent: { ...this.parent }, aspect: this.aspect, until: this.until.toISOString() };
  }
}

/** La case « Compte de groupe, sans livraison ». */
export class GroupWithoutDeliverySetEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly enabled: boolean,
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.groupWithoutDeliverySet;
  }
  protected override details(): Record<string, unknown> {
    return { enabled: this.enabled };
  }
}

/** La forme de prélèvement d'un site, à partir de `since` (plan-sous-comptes §2.1 ter). */
export class CollectionFormSetEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly form: CollectionForm,
    readonly since: Date,
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.collectionFormSet;
  }
  protected override details(): Record<string, unknown> {
    return { form: this.form, since: this.since.toISOString() };
  }
}
