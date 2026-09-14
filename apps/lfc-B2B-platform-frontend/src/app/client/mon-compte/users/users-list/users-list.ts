import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { ContactView } from '@lfd/contracts';

import { ClientCompany } from '../../../client-company.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { UserPanel } from '../../user-panel/user-panel';
import { contactLine, initialsOf, nameOf } from '../users-section';

/**
 * **Les interlocuteurs de la société** — la liste que lisent la carte bureau
 * et le panneau Utilisateurs, écrite une fois.
 *
 * Le détenteur est sorti de la liste : il occupe une ligne à lui, et la
 * hiérarchie est dans le FOND, pas dans une pastille de plus.
 *
 * ## 🔴 Elle listait cinq personnes qui n'existent pas
 *
 * Pierre, Hélène, Karim, le cabinet Ferrand, Léna — tous écrits en dur. Elles
 * viennent de `GET /me` : le **contact principal** (le détenteur) et les
 * **contacts additionnels** de la société.
 *
 * ## Deux états, et non trois
 *
 * Le fil n'en distingue que **deux** : le détenteur a un espace, un contact
 * additionnel n'en a pas, par construction du modèle. `invited` reviendra avec
 * l'invitation elle-même, qui n'est pas construite.
 */
@Component({
  selector: 'app-users-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UserPanel],
  templateUrl: './users-list.html',
  styleUrl: './users-list.scss',
})
export class UsersList {
  /**
   * Les contacts et la note sous le détenteur. `false` pour la carte mobile,
   * qui ne garde que la carte bleue du détenteur : la liste est dans le panneau.
   */
  readonly people = input(true);

  protected readonly t = inject(ClientCopyService).t;
  private readonly client = inject(ClientCompany);

  /** L'interlocuteur dont la fiche est ouverte — `null` la referme. */
  protected readonly opened = signal<ContactView | null>(null);

  /** Le contact PRINCIPAL : le détenteur, toujours présent quand la société l'est. */
  protected readonly holder = computed(() => this.client.company()?.primaryContact ?? null);

  protected readonly rows = computed(() =>
    (this.client.company()?.contacts ?? []).map((contact) => ({
      contact,
      initials: initialsOf(contact),
      name: nameOf(contact),
      line: contactLine(contact),
    })),
  );

  protected readonly holderInitials = computed(() => {
    const holder = this.holder();
    return holder === null ? '' : initialsOf(holder);
  });

  protected readonly holderName = computed(() => {
    const holder = this.holder();
    return holder === null ? '' : nameOf(holder);
  });

  protected open(contact: ContactView): void {
    this.opened.set(contact);
  }
}
