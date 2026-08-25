import { ACCOUNT_FACTS } from "./account-facts.js";
import { CompanyStaffAct } from "./staff-acts.event.js";

/**
 * Les actes du staff sur le **carnet de contacts** d'un client.
 *
 * La charge porte le rôle et l'identifiant, **jamais l'e-mail ni le téléphone**.
 * Le journal se relit largement et se garde longtemps ; y verser les
 * coordonnées d'une personne en ferait un annuaire parallèle, que rien
 * n'effacerait le jour où le contact demande à disparaître. Qui a été touché se
 * lit sur la fiche ; ce que le journal doit dire, c'est QUI l'a touché.
 */
export class ContactAddedByStaffEvent extends CompanyStaffAct {
  constructor(
    companyId: string,
    readonly contactId: string,
    readonly role: string,
  ) {
    super(companyId);
  }
  protected type(): string {
    return ACCOUNT_FACTS.contactAdded;
  }
  protected override details(): Record<string, unknown> {
    return { contactId: this.contactId, role: this.role };
  }
}

export class ContactUpdatedByStaffEvent extends CompanyStaffAct {
  constructor(
    companyId: string,
    readonly contactId: string,
    readonly role: string,
  ) {
    super(companyId);
  }
  protected type(): string {
    return ACCOUNT_FACTS.contactUpdated;
  }
  protected override details(): Record<string, unknown> {
    return { contactId: this.contactId, role: this.role };
  }
}

export class ContactRemovedByStaffEvent extends CompanyStaffAct {
  constructor(
    companyId: string,
    readonly contactId: string,
  ) {
    super(companyId);
  }
  protected type(): string {
    return ACCOUNT_FACTS.contactRemoved;
  }
  protected override details(): Record<string, unknown> {
    return { contactId: this.contactId };
  }
}

/** L'interlocuteur principal change — c'est lui qui reçoit les courriers. */
export class PrimaryContactChangedByStaffEvent extends CompanyStaffAct {
  constructor(companyId: string) {
    super(companyId);
  }
  protected type(): string {
    return ACCOUNT_FACTS.primaryContactChanged;
  }
}
