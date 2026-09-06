import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { COMPANY_ROLE_LABELS, type ContactView } from '@lfd/contracts';

import { ClientCopyService } from '../../copy/client-copy.service';
import { ClientDialog } from '../../dialog/client-dialog';

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
 * une ligne de coordonnées, pas un compte. L'inviter est une décision SÉPARÉE,
 * jamais un effet de bord de la création — c'est la seule chose qui empêche
 * « ajouter un contact » de créer un compte à quelqu'un qui n'en voulait pas.
 *
 * ⚠️ Rien ne part : l'invitation d'un interlocuteur par le détenteur est l'un
 * des trois ajouts que `08-mon-compte.md` demande au back-office.
 */
@Component({
  selector: 'app-user-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClientDialog],
  templateUrl: './user-panel.html',
  styleUrl: './user-panel.scss',
})
export class UserPanel {
  readonly contact = input<ContactView | null>(null);

  readonly closed = output<void>();

  protected readonly t = inject(ClientCopyService).t;

  protected readonly open = computed(() => this.contact() !== null);

  /**
   * Le détenteur se reconnaît à son `id` NUL : le contact principal est aplati
   * sur la société, les additionnels portent le leur. C'est la même distinction
   * que fait le contrat, pas une convention d'écran.
   */
  protected readonly isHolder = computed(() => this.contact()?.id === null);

  /** Le nom affiché, ou l'e-mail : prénom et nom sont facultatifs au modèle. */
  protected readonly name = computed(() => {
    const contact = this.contact();
    if (contact === null) {
      return '';
    }
    const full = `${contact.firstName} ${contact.lastName}`.trim();
    return full === '' ? contact.email : full;
  });

  protected readonly initials = computed(() =>
    this.name()
      .split(/\s+/u)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join(''),
  );

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
}
