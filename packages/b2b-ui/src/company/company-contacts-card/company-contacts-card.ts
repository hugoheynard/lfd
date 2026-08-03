import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
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
  FoldPopoverTriggerDirective,
} from 'fold-ng';

import type { CompanyContactCardView } from '../company-contacts.view-model';

/**
 * Section **Contacts** d'une société — présentation pure.
 *
 * Rend la liste de cartes (principal en tête, badgé « Vous » le cas échéant),
 * le menu par carte et la **confirmation inline** de suppression. Cette
 * confirmation est un état d'UI local, donc porté ici ; le container ne reçoit
 * que l'intention finale (`removeContact`). Aucun service, aucun modèle d'app :
 * données par `input()`, intentions par `output()`.
 */
@Component({
  selector: 'lfd-company-contacts-card',
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
  templateUrl: './company-contacts-card.html',
  styleUrl: './company-contacts-card.scss',
})
export class CompanyContactsCard {
  /** Les cartes à afficher (principal d'abord, puis additionnels). */
  readonly contacts = input.required<readonly CompanyContactCardView[]>();
  /** Le gestionnaire peut ajouter / éditer / supprimer (bouton + menus). */
  readonly canManage = input(false);

  /** Ajouter un contact. */
  readonly add = output<void>();
  /** Éditer un contact — `null` = le contact principal. */
  readonly editContact = output<string | null>();
  /** Supprimer un contact additionnel (confirmé). */
  readonly removeContact = output<string>();
  /** Inviter un contact additionnel à créer son espace. */
  readonly inviteContact = output<string>();

  /** Carte dont la confirmation de suppression est ouverte (état UI local). */
  protected readonly confirmingId = signal<string | null>(null);

  /** « Supprimer » du menu : ouvre la confirmation inline, sans rien émettre. */
  protected askRemove(card: CompanyContactCardView): void {
    if (!card.isPrimary && card.contactId !== null) {
      this.confirmingId.set(card.contactId);
    }
  }

  /** Confirmation acceptée : ferme et émet l'intention de suppression. */
  protected confirmRemove(card: CompanyContactCardView): void {
    if (card.isPrimary || card.contactId === null) {
      return;
    }
    this.confirmingId.set(null);
    this.removeContact.emit(card.contactId);
  }

  /** Émet l'intention d'invitation (jamais sur le principal). */
  protected onInvite(card: CompanyContactCardView): void {
    if (card.contactId !== null) {
      this.inviteContact.emit(card.contactId);
    }
  }
}
