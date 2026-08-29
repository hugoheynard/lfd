import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { COMPANY_ROLE_LABELS } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { CompanyContactsCard, type CompanyContactCardView } from '@lfd/b2b-ui/company';

import { EMPTY_CONTACT, type Company } from '../../../account/account.model';
import { canManageCompany } from '../../../account/account.model';
import { AccountService } from '../../../account/account.service';
import {
  ContactPanel,
  contactToDraft,
  type ContactPanelData,
} from '../contact-panel/contact-panel';

/**
 * Section **Contacts** d'une entreprise côté **client** — _container_ de la
 * carte présentationnelle `@lfd/b2b-ui/company`. Il projette les contacts
 * (principal aplati + additionnels) vers le view-model neutre, calcule la
 * capacité (gestionnaire = `owner` ou `admin`) et câble les intentions de la carte
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
  protected readonly canManage = computed(() => canManageCompany(this.company().role));

  /** Contacts projetés vers le view-model neutre de la carte. */
  protected readonly contacts = computed<CompanyContactCardView[]>(() => {
    const company = this.company();
    const myEmail = this.account.profile()?.email ?? null;

    const primary: CompanyContactCardView = {
      contactId: company.primaryContact.id,
      firstName: company.primaryContact.firstName,
      lastName: company.primaryContact.lastName,
      role: 'Détenteur du compte',
      fonction: company.primaryContact.fonction,
      email: company.primaryContact.email,
      phone: company.primaryContact.phone,
      isPrimary: true,
      isYou: myEmail !== null && company.primaryContact.email === myEmail,
      // Cet écran ne sait rien des accès des autres : `null` plutôt qu'un
      // « pas d'accès » que la vue ne peut pas soutenir.
      access: null,
      emailVerified: false,
    };
    const others = company.contacts.map<CompanyContactCardView>((contact) => ({
      contactId: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      role: contact.role === null ? 'Rôle à préciser' : COMPANY_ROLE_LABELS[contact.role],
      fonction: contact.fonction,
      email: contact.email,
      phone: contact.phone,
      isPrimary: false,
      isYou: myEmail !== null && contact.email === myEmail,
      access: null,
      emailVerified: false,
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
  protected onInvite(_contactId: string | null): void {
    // TODO(invitation) : POST /companies/:id/invitations — flux à construire.
  }

  private openPanel(data: ContactPanelData): void {
    this.panelHost.open(ContactPanel, { data, side: 'right' });
  }
}
