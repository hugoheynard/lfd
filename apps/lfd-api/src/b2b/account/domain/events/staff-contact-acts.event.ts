import type { JournalFactType } from "@lfd/contracts/journal-facts";

import { ACCOUNT_FACTS } from "./account-facts.js";
import type { NamedRef, PersonRef } from "./journal-names.js";
import { CompanyStaffAct } from "./staff-acts.event.js";

/**
 * Les actes du staff sur le **carnet de contacts** d'un client.
 *
 * La charge porte le rôle et l'identifiant, **jamais l'e-mail ni le téléphone**.
 * Le journal se relit largement et se garde longtemps ; y verser les
 * coordonnées d'une personne en ferait un annuaire parallèle, que rien
 * n'effacerait le jour où le contact demande à disparaître. Qui a été touché se
 * lit sur la fiche ; ce que le journal doit dire, c'est QUI l'a touché.
 *
 * Le contact y est cité par son id et son **nom** du moment quand il en a un
 * (lot B du plan des phrases, D5) : un nom n'est pas une coordonnée. Le retrait
 * ne relit pas la fiche qu'il efface : il cite l'id seul, et le fait d'ajout,
 * toujours au journal, dit qui c'était.
 */
export class ContactAddedByStaffEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly contact: PersonRef,
    readonly role: string,
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.contactAdded;
  }
  protected override details(): Record<string, unknown> {
    return { contact: { ...this.contact }, role: this.role };
  }
}

export class ContactUpdatedByStaffEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly contact: PersonRef,
    readonly role: string,
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.contactUpdated;
  }
  protected override details(): Record<string, unknown> {
    return { contact: { ...this.contact }, role: this.role };
  }
}

export class ContactRemovedByStaffEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly contact: PersonRef,
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.contactRemoved;
  }
  protected override details(): Record<string, unknown> {
    return { contact: { ...this.contact } };
  }
}

/** L'interlocuteur principal change — c'est lui qui reçoit les courriers. */
export class PrimaryContactChangedByStaffEvent extends CompanyStaffAct {
  constructor(company: NamedRef) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.primaryContactChanged;
  }
}
