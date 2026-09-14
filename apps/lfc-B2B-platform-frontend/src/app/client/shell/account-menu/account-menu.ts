import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldPanelHostService,
  FoldPopoverTriggerDirective,
} from 'fold-ng';

import { AccountService } from '../../../account/account.service';
import { AuthFacade } from '../../../auth/auth.facade';
import { ClientIdentity } from '../../client-identity.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { ProfilePanel } from '../../profile/profile-panel/profile-panel';

/**
 * **Le menu de la personne**, au bout de la barre du bureau : le prénom et
 * l'initiale deviennent un vrai bouton, qui déroule « Mon profil » et « Se
 * déconnecter ».
 *
 * ## Pourquoi ici, et pas dans Mon compte
 *
 * Mon compte est le dossier de la SOCIÉTÉ ; le profil est celui de la PERSONNE
 * connectée (Hugo, 2026-09-14). Il s'ouvre donc depuis ce qui la représente à
 * l'écran — son initiale —, et la déconnexion, action de la personne elle
 * aussi, le rejoint. En pile, le menu de poche porte les deux mêmes gestes.
 *
 * Le profil vient de `AccountService.profile`, la lecture de `GET /me` que le
 * shell déclenche déjà : aucune seconde lecture.
 *
 * Un visiteur non reconnu n'a ni profil ni session : le bloc ne paraît pas.
 */
@Component({
  selector: 'app-account-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldDropdownComponent, FoldDropdownItemComponent, FoldPopoverTriggerDirective],
  templateUrl: './account-menu.html',
  styleUrl: './account-menu.scss',
})
export class AccountMenu {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly identity = inject(ClientIdentity);
  private readonly auth = inject(AuthFacade);
  private readonly account = inject(AccountService);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly recognised = computed(() => this.auth.isAuthenticated());
  protected readonly open = signal(false);

  /** L'initiale, ou un point d'interrogation : on ne devine pas un nom. */
  protected readonly initials = computed(() => this.identity.firstName()?.charAt(0) ?? '?');

  /**
   * Le nom du déclencheur : ce qu'il ouvre, puis le prénom qu'on voit. Le prénom
   * y reste pour que le nom entendu contienne ce qui est lu à l'écran.
   */
  protected readonly triggerLabel = computed(() => {
    const name = this.identity.firstName();
    const label = this.t().chrome.accountMenu;
    return name === null ? label : `${label} — ${name}`;
  });

  /** Le profil n'est pas encore relu : l'entrée attend plutôt que d'ouvrir un dialogue vide. */
  protected readonly hasProfile = computed(() => this.account.profile() !== null);

  protected openProfile(): void {
    const profile = this.account.profile();
    if (profile !== null) {
      ProfilePanel.open(this.panels, profile);
    }
  }

  /** La même sortie que le menu de poche. */
  protected logout(): void {
    this.auth.logout();
  }
}
