import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { COMPANY_ROLE_LABELS, type ContactView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInlineConfirmComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { AccountService } from '../../../account/account.service';
import { ClientCompany } from '../../client-company.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { ClientDialog } from '../../dialog/client-dialog';
import { ContactEditPanel } from '../users/contact-edit-panel/contact-edit-panel';
import { canManageContacts, initialsOf, nameOf } from '../users/users-section';

/**
 * La fiche d'un interlocuteur — un PANNEAU, pas une ligne dépliée.
 *
 * ## 🔴 Elle décrivait une personne inventée
 *
 * Trois droits en oui/non, une date d'invitation, un état d'espace : rien de
 * tout cela ne traverse `GET /me`. Le panneau lit désormais le `ContactView`
 * que la société porte.
 *
 * ## Deux situations, et elles diffèrent VRAIMENT
 *
 * Le **détenteur** a un espace — c'est celui qui lit l'écran —, et il y lit que
 * son propre accès ne se retire pas d'ici : il faut d'abord transmettre le rôle.
 * Dire pourquoi vaut mieux que griser.
 *
 * Un **contact additionnel** n'en a pas, par construction : `CompanyContact` est
 * une ligne de coordonnées, pas un compte.
 *
 * ## Modifier, supprimer — et plus d'« Inviter »
 *
 * Aux rôles que l'API laisse écrire, « Modifier » ouvre le panneau d'édition
 * (détenteur ou contact), et « Supprimer » un contact passe par une
 * confirmation EN PLACE. Le bouton « Inviter à créer son espace » ne faisait
 * rien, et aucune route client n'invite un contact (vérifié le 2026-09-14,
 * `company-contacts.controller.ts`) : un bouton sans action se lit comme une
 * panne, il est retiré.
 *
 * ⚠️ « Modifier » ferme la fiche AVANT d'ouvrir le panneau : la fiche est un
 * `<dialog>` modal, dans la couche supérieure du navigateur, et un panneau fold
 * ouvert par-dessus resterait dessous.
 */
@Component({
  selector: 'app-user-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClientDialog, FoldButtonComponent, FoldCalloutComponent, FoldInlineConfirmComponent],
  templateUrl: './user-panel.html',
  styleUrl: './user-panel.scss',
})
export class UserPanel {
  readonly contact = input<ContactView | null>(null);

  readonly closed = output<void>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly client = inject(ClientCompany);
  private readonly account = inject(AccountService);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly open = computed(() => this.contact() !== null);

  /**
   * Le détenteur se reconnaît à son `id` NUL : le contact principal est aplati
   * sur la société, les additionnels portent le leur. C'est la même distinction
   * que fait le contrat, pas une convention d'écran.
   */
  protected readonly isHolder = computed(() => this.contact()?.id === null);

  /** `owner`/`admin` : ceux que l'API laisse modifier et retirer. */
  protected readonly canManage = computed(() => canManageContacts(this.client.company()));

  /** La confirmation du retrait est-elle déployée ? Pilotée d'ici pour se replier après l'envoi. */
  protected readonly confirming = signal(false);
  protected readonly removing = signal(false);
  /** Le message du dernier refus de retrait, `null` tant qu'il n'y en a pas. */
  protected readonly refusal = signal<string | null>(null);

  /** Le nom affiché, ou l'e-mail : prénom et nom sont facultatifs au modèle. */
  protected readonly name = computed(() => {
    const contact = this.contact();
    return contact === null ? '' : nameOf(contact);
  });

  protected readonly initials = computed(() => {
    const contact = this.contact();
    return contact === null ? '' : initialsOf(contact);
  });

  /** Le téléphone manquant se DIT — un vide se lit comme un bug. */
  protected readonly phone = computed(() => {
    const value = this.contact()?.phone ?? '';
    return value === '' ? this.t().account.noPhone : value;
  });

  /**
   * Le rôle en toutes lettres. `null` reste « à préciser » : les contacts
   * d'avant les rôles n'en ont pas, et le deviner serait leur en attribuer un.
   */
  protected readonly role = computed(() => {
    const contact = this.contact();
    if (contact === null) {
      return '';
    }
    return contact.role === null ? this.t().account.roleUnset : COMPANY_ROLE_LABELS[contact.role];
  });

  /** La fonction saisie, quand il y en a une. */
  protected readonly fonction = computed(() => {
    const value = this.contact()?.fonction ?? '';
    return value === '' ? this.t().account.roleUnset : value;
  });

  /** Les libellés de la confirmation, dans la langue de l'app — fold parle anglais par défaut. */
  protected readonly removeLabels = computed(() => {
    const copy = this.t().account;
    return {
      confirm: copy.contactRemoveConfirm,
      cancel: copy.cancel,
      busy: copy.contactRemoveBusy,
      group: copy.contactRemoveGroup,
    };
  });

  constructor() {
    // Une autre personne ouverte n'hérite ni du refus ni de la confirmation de la précédente.
    effect(() => {
      this.contact();
      untracked(() => {
        this.refusal.set(null);
        this.confirming.set(false);
      });
    });
  }

  protected edit(): void {
    const company = this.client.company();
    const contact = this.contact();
    if (company === null || contact === null) {
      return;
    }
    this.closed.emit();
    ContactEditPanel.open(this.panels, company, contact);
  }

  /**
   * Retire le contact confirmé. Au succès la fiche se ferme — `/me` relu ne le
   * porte plus ; sur un refus elle reste ouverte et le montre.
   */
  protected async remove(): Promise<void> {
    const company = this.client.company();
    const contact = this.contact();
    if (company === null || contact === null || contact.id === null || this.removing()) {
      return;
    }
    this.removing.set(true);
    this.refusal.set(null);
    const refusal = await this.account.deleteContact(company.id, contact.id);
    this.removing.set(false);
    this.confirming.set(false);
    if (refusal === null) {
      this.closed.emit();
    } else {
      this.refusal.set(refusal);
    }
  }
}
