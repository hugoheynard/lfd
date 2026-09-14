import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FoldButtonComponent, FoldPanelHostService } from 'fold-ng';

import { AccountService } from '../../../../account/account.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { ProfilePanel } from '../profile-panel/profile-panel';

/**
 * La carte **Mes informations** du bureau : prénom, nom, e-mail, téléphone de
 * la personne connectée, et « Modifier » — pour TOUT membre, rôle compris :
 * c'est son profil, pas celui de la société.
 */
@Component({
  selector: 'app-profile-desk-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './profile-desk-card.html',
  styleUrl: './profile-desk-card.scss',
})
export class ProfileDeskCard {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly profile = inject(AccountService).profile;
  private readonly panels = inject(FoldPanelHostService);

  protected open(): void {
    const profile = this.profile();
    if (profile !== null) {
      ProfilePanel.open(this.panels, profile);
    }
  }
}
