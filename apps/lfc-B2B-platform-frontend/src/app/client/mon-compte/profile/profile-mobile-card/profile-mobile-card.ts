import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldPanelHostService } from 'fold-ng';

import { AccountService } from '../../../../account/account.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { CardFoot } from '../../card-foot/card-foot';
import { ProfilePanel } from '../profile-panel/profile-panel';

/**
 * La carte **Mes informations** en pile : le nom et l'adresse — ce qu'on veut
 * savoir sans ouvrir. Le téléphone et la phrase sont dans le panneau, que le
 * bouton ouvre pour tout membre.
 */
@Component({
  selector: 'app-profile-mobile-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardFoot],
  templateUrl: './profile-mobile-card.html',
  styleUrl: './profile-mobile-card.scss',
})
export class ProfileMobileCard {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly profile = inject(AccountService).profile;
  private readonly panels = inject(FoldPanelHostService);

  /** « Prénom Nom », ou un tiret : le domaine les exige, mais un profil d'avant peut en manquer. */
  protected readonly name = computed(() => {
    const profile = this.profile();
    const full = `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim();
    return full === '' ? this.t().account.identityUnknown : full;
  });

  protected open(): void {
    const profile = this.profile();
    if (profile !== null) {
      ProfilePanel.open(this.panels, profile);
    }
  }
}
