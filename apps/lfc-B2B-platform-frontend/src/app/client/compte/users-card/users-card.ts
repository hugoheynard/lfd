import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import { ClientCopyService } from '../../copy/client-copy.service';
import type { AccountUser } from '../../mock-account';
import { MOCK_USERS } from '../../mock-account';
import { UserPanel } from '../user-panel/user-panel';

/**
 * La carte UTILISATEURS — trois états, pas deux.
 *
 * Un contact peut n'être qu'un nom et un e-mail qui reçoit les factures : le
 * cabinet comptable n'a aucune raison d'avoir un espace. L'invitation est une
 * décision SÉPARÉE, jamais un effet de bord de la création — c'est la seule
 * chose qui empêche « ajouter un contact » de créer un compte à quelqu'un qui
 * n'en voulait pas.
 *
 * Le détenteur est sorti de la liste : il occupe une carte en tête. La
 * hiérarchie est dans le FOND, pas dans une pastille de plus.
 */
@Component({
  selector: 'app-users-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent, UserPanel],
  templateUrl: './users-card.html',
  styleUrl: './users-card.scss',
})
export class UsersCard {
  protected readonly t = inject(ClientCopyService).t;

  /** La personne dont le panneau est ouvert — `null` le referme. */
  protected readonly opened = signal<AccountUser | null>(null);

  protected readonly holder = MOCK_USERS.find((user) => user.holder) ?? null;

  protected readonly others = MOCK_USERS.filter((user) => !user.holder);

  protected readonly count = MOCK_USERS.length;

  protected readonly rows = computed(() =>
    this.others.map((user) => ({
      user,
      tag: this.tagOf(user),
      /** La sous-ligne dit la fonction ET les droits — « Comptable · Factures ». */
      line: [user.role, this.rightsOf(user)].filter((part) => part !== '').join(' · '),
    })),
  );

  protected open(user: AccountUser): void {
    this.opened.set(user);
  }

  private tagOf(user: AccountUser): string {
    const copy = this.t().account;
    if (user.space === 'active') {
      return copy.tagActive;
    }
    return user.space === 'invited' ? copy.tagInvited : copy.tagContact;
  }

  private rightsOf(user: AccountUser): string {
    const copy = this.t().account;
    return [
      user.canOrder ? copy.canOrder : '',
      user.canInvoices ? copy.canInvoices : '',
      user.canAdmin ? copy.canAdmin : '',
    ]
      .filter((part) => part !== '')
      .join(' · ');
  }
}
