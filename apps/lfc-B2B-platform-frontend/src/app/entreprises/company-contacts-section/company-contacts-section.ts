import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FoldPanelHostService } from 'fold-ng';
import { CompanyContactsCard, type CompanyContactCardView } from '@lfd/b2b-ui/company';

import { EMPTY_CONTACT, type Company } from '../../account/account.model';
import { AccountService } from '../../account/account.service';
import {
  ContactPanel,
  contactToDraft,
  type ContactPanelData,
} from '../contact-panel/contact-panel';

/**
 * Section **Contacts** d'une entreprise côté **client** — _container_ de la
 * carte présentationnelle `@lfd/b2b-ui/company`. Il projette les contacts
 * (principal aplati + additionnels) vers le view-model neutre, calcule la
 * capacité (gestionnaire = `company_admin`) et câble les intentions de la carte
 * vers `AccountService` et le panneau d'édition. Édition réservée au
 * gestionnaire — le backend l'impose de toute façon (mur) ; l'UI ne propose pas
 * ce qu'elle sait refusé.
 */
@Component({
  selector: 'app-company-contacts-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CompanyContactsCard],
  templateUrl: './company-contacts-section.html',
})
export class CompanyContactsSection {
  private readonly account = inject(AccountService);
  private readonly panelHost = inject(FoldPanelHostService);

  readonly company = input.required<Company>();

  /** Seul le gestionnaire de l'entreprise gère ses contacts. */
  protected readonly canManage = computed(() => this.company().role === 'company_admin');

  /** Contacts projetés vers le view-model neutre de la carte. */
  protected readonly contacts = computed<CompanyContactCardView[]>(() => {
    const company = this.company();
    const myEmail = this.account.profile()?.email ?? null;

    const primary: CompanyContactCardView = {
      contactId: company.primaryContact.id,
      firstName: company.primaryContact.firstName,
      lastName: company.primaryContact.lastName,
      role: 'Admin du compte entreprise',
      fonction: company.primaryContact.fonction,
      email: company.primaryContact.email,
      phone: company.primaryContact.phone,
      isPrimary: true,
      isYou: myEmail !== null && company.primaryContact.email === myEmail,
    };
    const others = company.contacts.map<CompanyContactCardView>((contact) => ({
      contactId: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      role: contact.fonction === '' ? 'Contact' : contact.fonction,
      fonction: contact.fonction,
      email: contact.email,
      phone: contact.phone,
      isPrimary: false,
      isYou: myEmail !== null && contact.email === myEmail,
    }));
    return [primary, ...others];
  });

  /** Ouvre le panneau pour un nouveau contact additionnel. */
  protected onAdd(): void {
    this.openPanel({
      companyId: this.company().id,
      target: { kind: 'additional', contactId: null },
      initial: EMPTY_CONTACT,
    });
  }

  /** Ouvre le panneau d'édition d'un contact — `null` = le principal. */
  protected onEdit(contactId: string | null): void {
    const company = this.company();
    if (contactId === null) {
      this.openPanel({
        companyId: company.id,
        target: { kind: 'primary' },
        initial: contactToDraft(company.primaryContact),
      });
      return;
    }
    const contact = company.contacts.find((c) => c.id === contactId);
    if (contact === undefined) {
      return;
    }
    this.openPanel({
      companyId: company.id,
      target: { kind: 'additional', contactId },
      initial: contactToDraft(contact),
    });
  }

  /** Retire réellement un contact additionnel (confirmé dans la carte). */
  protected onRemove(contactId: string): void {
    this.account.removeContact(this.company().id, contactId);
  }

  /**
   * Ouvre l'invitation d'un contact à créer son espace utilisateur.
   *
   * ⚠️ NON câblé : le flux d'invitation intra-société n'existe pas encore côté
   * backend. L'intention est là pour cadrer l'UX ; l'action sera branchée quand
   * l'endpoint d'invitation existera.
   */
  protected onInvite(_contactId: string): void {
    // TODO(invitation) : POST /companies/:id/invitations — flux à construire.
  }

  private openPanel(data: ContactPanelData): void {
    this.panelHost.open(ContactPanel, { data, side: 'right' });
  }
}
