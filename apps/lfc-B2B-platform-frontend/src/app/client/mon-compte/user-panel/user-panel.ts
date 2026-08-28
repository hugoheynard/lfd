import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { ClientDialog } from '../../dialog/client-dialog';
import { ClientCopyService } from '../../copy/client-copy.service';
import type { AccountUser } from '../../mock-account';

/**
 * La fiche d'une personne — un PANNEAU, pas une ligne dépliée.
 *
 * Elle porte trois droits en oui/non et, surtout, un bloc d'espace qui **change
 * de nature** selon l'état : inviter pour un contact, relancer ou annuler pour
 * une invitation, retirer l'accès pour un espace actif. Ce sont trois situations
 * différentes, pas trois libellés d'un même bouton.
 *
 * Le détenteur y lit que son propre accès ne se retire pas d'ici : il faut
 * d'abord transmettre le rôle. Dire pourquoi vaut mieux que griser.
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
  readonly user = input<AccountUser | null>(null);

  readonly closed = output<void>();

  protected readonly t = inject(ClientCopyService).t;

  protected readonly open = computed(() => this.user() !== null);

  /** Le téléphone manquant se DIT — un vide se lit comme un bug. */
  protected readonly phone = computed(() => {
    const value = this.user()?.phone ?? '';
    return value === '' ? this.t().account.noPhone : value;
  });

  protected readonly tag = computed(() => {
    const copy = this.t().account;
    const space = this.user()?.space;
    if (space === 'active') {
      return copy.tagActive;
    }
    return space === 'invited' ? copy.tagInvited : copy.tagContact;
  });

  protected readonly rights = computed(() => {
    const person = this.user();
    const copy = this.t().account;
    if (person === null) {
      return [];
    }
    return [
      { label: copy.canOrder, granted: person.canOrder },
      { label: copy.canInvoices, granted: person.canInvoices },
      { label: copy.canAdmin, granted: person.canAdmin },
    ];
  });

  protected readonly invitedOn = computed(() =>
    this.t().account.spaceInvitedBody.replace('{date}', this.user()?.since ?? ''),
  );

  protected readonly activeSince = computed(() =>
    this.t().account.spaceActiveBody.replace('{date}', this.user()?.since ?? ''),
  );
}
