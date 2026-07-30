import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldPageSectionComponent,
  FoldPanelHostService,
  FoldPopoverTriggerDirective,
} from 'fold-ng';

import { EMPTY_CONTACT, type Company, type Contact } from '../../account/account.model';
import { AccountService } from '../../account/account.service';
import {
  ContactPanel,
  contactToDraft,
  type ContactPanelData,
} from '../contact-panel/contact-panel';

/** Une carte de contact prête à afficher — dérivée du contact + de son emploi. */
interface ContactCard {
  readonly contact: Contact;
  /** Le contact principal : première carte, non supprimable. */
  readonly isPrimary: boolean;
  /** Libellé sous le nom : « Admin du compte entreprise » ou la fonction. */
  readonly role: string;
  /** Le contact, c'est vous (la personne connectée). */
  readonly isYou: boolean;
}

/**
 * Section **Contacts** d'une entreprise.
 *
 * La première carte est **toujours** le contact principal (« Admin du compte
 * entreprise »), badgé « Vous » quand c'est la personne connectée ; suivent les
 * contacts additionnels. Chaque carte porte sa bande de titre en surface *raised*
 * avec un menu (dropover) : « Modifier » partout, « Supprimer » pour les seuls
 * additionnels — le principal ne se supprime pas.
 *
 * Édition réservée au **gestionnaire** : si la personne n'est pas
 * `company_admin` de cette entreprise, la section est en lecture seule (ni bouton
 * « Ajouter », ni menu). Le backend l'impose de toute façon (mur) ; l'UI ne
 * propose pas ce qu'elle sait refusé.
 */
@Component({
  selector: 'app-company-contacts-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldCalloutComponent,
    FoldFieldListComponent,
    FoldFieldComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldIconComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldInlineConfirmComponent,
    FoldPopoverTriggerDirective,
  ],
  templateUrl: './company-contacts-section.html',
  styleUrl: './company-contacts-section.scss',
})
export class CompanyContactsSection {
  private readonly account = inject(AccountService);
  private readonly panelHost = inject(FoldPanelHostService);

  readonly company = input.required<Company>();

  /** Seul le gestionnaire de l'entreprise gère ses contacts. */
  protected readonly canManage = computed(() => this.company().role === 'company_admin');

  protected readonly cards = computed<ContactCard[]>(() => {
    const company = this.company();
    const myEmail = this.account.profile()?.email ?? null;

    const primary: ContactCard = {
      contact: company.primaryContact,
      isPrimary: true,
      role: 'Admin du compte entreprise',
      isYou: myEmail !== null && company.primaryContact.email === myEmail,
    };
    const others = company.contacts.map<ContactCard>((contact) => ({
      contact,
      isPrimary: false,
      role: contact.fonction === '' ? 'Contact' : contact.fonction,
      isYou: myEmail !== null && contact.email === myEmail,
    }));
    return [primary, ...others];
  });

  /**
   * L'id du contact dont on **confirme** la suppression, ou `null`. La
   * confirmation est *inline* (`fold-inline-confirm`) : « Supprimer » du menu
   * n'efface pas, il ouvre ce pas de confirmation sur la carte.
   */
  protected readonly confirmingId = signal<string | null>(null);

  protected addContact(): void {
    this.openPanel({
      companyId: this.company().id,
      target: { kind: 'additional', contactId: null },
      initial: EMPTY_CONTACT,
    });
  }

  protected edit(card: ContactCard): void {
    this.openPanel({
      companyId: this.company().id,
      target: card.isPrimary
        ? { kind: 'primary' }
        : { kind: 'additional', contactId: card.contact.id },
      initial: contactToDraft(card.contact),
    });
  }

  /**
   * « Supprimer » du menu : ouvre la confirmation inline, sans rien effacer.
   *
   * Le contact **principal** (le propriétaire du compte) n'est jamais supprimable
   * ici — il n'a même pas l'entrée de menu. TODO(owner-removal) : retirer le
   * propriétaire est un flux à part (transfert de propriété, RGPD/effacement),
   * pas une simple suppression de contact ; à cadrer plus tard.
   */
  protected askRemove(card: ContactCard): void {
    if (!card.isPrimary && card.contact.id !== null) {
      this.confirmingId.set(card.contact.id);
    }
  }

  /** Confirmation acceptée : on retire réellement le contact. */
  protected confirmRemove(card: ContactCard): void {
    if (card.isPrimary || card.contact.id === null) {
      return;
    }
    this.confirmingId.set(null);
    this.account.removeContact(this.company().id, card.contact.id);
  }

  /**
   * Ouvre l'invitation d'un contact à créer son espace utilisateur.
   *
   * ⚠️ NON câblé : le flux d'invitation intra-société (créer un compte pour un
   * contact, connection Auth0 dédiée) n'existe pas encore côté backend. Le bouton
   * est présent pour cadrer l'UX ; l'action sera branchée quand l'endpoint
   * d'invitation existera.
   */
  protected invite(_card: ContactCard): void {
    // TODO(invitation) : POST /companies/:id/invitations — flux à construire.
  }

  private openPanel(data: ContactPanelData): void {
    this.panelHost.open(ContactPanel, { data, side: 'right' });
  }
}
