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
import {
  ClientWorkspace,
  currentWorkspaceLabel,
  workspaceEntries,
} from '../../client-workspace.service';
import { ClientWorkspaceSwitch } from '../../client-workspace-switch.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { ProfilePanel } from '../../profile/profile-panel/profile-panel';

/**
 * **Le menu de la personne**, au bout de la barre du bureau : le prénom et
 * l'initiale deviennent un vrai bouton, qui déroule le sélecteur d'espace,
 * « Mon profil » et « Se déconnecter ».
 *
 * ## Pourquoi ici, et pas dans Mon compte
 *
 * Mon compte est le dossier de la SOCIÉTÉ ; le profil est celui de la PERSONNE
 * connectée (Hugo, 2026-09-14). Il s'ouvre donc depuis ce qui la représente à
 * l'écran — son initiale —, et la déconnexion, action de la personne elle
 * aussi, le rejoint. En pile, le menu de poche porte les mêmes gestes.
 *
 * ## Le sélecteur d'espace (plan espace de travail, D8)
 *
 * Choisir pour qui l'on travaille est un geste de la personne, pas de la
 * société : il vit donc ici aussi. **Il n'existe qu'à partir d'une société**
 * (Hugo, 2026-09-15) — sans rattachement, il n'y a qu'un espace, et le menu
 * reste tel qu'il était. L'espace courant est marqué de `check` :
 * `fold-dropdown-item` n'a pas d'état coché (fold-ng 0.27, vérifié le
 * 2026-09-15 dans `fold-ng.d.ts` — `disabled`, `tone`, `icon`, `selected`).
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
  protected readonly workspace = inject(ClientWorkspace);
  private readonly switcher = inject(ClientWorkspaceSwitch);
  private readonly auth = inject(AuthFacade);
  private readonly account = inject(AccountService);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly recognised = computed(() => this.auth.isAuthenticated());
  protected readonly open = signal(false);

  /** L'initiale, ou un point d'interrogation : on ne devine pas un nom. */
  protected readonly initials = computed(() => this.identity.firstName()?.charAt(0) ?? '?');

  /** Les espaces proposés, le courant marqué. */
  protected readonly spaces = computed(() =>
    workspaceEntries(
      this.workspace.options(),
      this.workspace.current(),
      this.t().chrome.workspacePersonal,
    ),
  );

  /** La ligne sous le sélecteur : l'enseigne en cours, ou « Compte perso ». */
  protected readonly currentSpace = computed(() =>
    currentWorkspaceLabel(this.workspace.company(), this.t().chrome.workspaceCurrentPersonal),
  );

  /**
   * Le nom du déclencheur : ce qu'il ouvre, puis le prénom qu'on voit. Le prénom
   * y reste pour que le nom entendu contienne ce qui est lu à l'écran.
   *
   * L'espace en cours s'y ajoute quand il y a un choix : la ligne qui le dit
   * dans le menu n'est pas une entrée, et un lecteur d'écran qui parcourt un
   * menu ne s'arrête que sur les entrées.
   */
  protected readonly triggerLabel = computed(() => {
    const name = this.identity.firstName();
    const copy = this.t().chrome;
    const label = name === null ? copy.accountMenu : `${copy.accountMenu} — ${name}`;
    return this.workspace.hasChoice()
      ? `${label} · ${copy.workspaceCurrentFor} ${this.currentSpace()}`
      : label;
  });

  /** Le profil n'est pas encore relu : l'entrée attend plutôt que d'ouvrir un dialogue vide. */
  protected readonly hasProfile = computed(() => this.account.profile() !== null);

  /** L'espace change, et l'écran suit — cf. `ClientWorkspaceSwitch`. */
  protected choose(workspace: string): void {
    void this.switcher.switchTo(workspace);
  }

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
