import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  FoldAppShellComponent,
  FoldAvatarComponent,
  FoldButtonIconComponent,
  FoldMenuComponent,
  FoldMenuItemComponent,
  FoldPanelHostComponent,
  FoldSearchComponent,
  FoldSurfaceDirective,
} from 'fold-ng';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    FoldAppShellComponent,
    FoldAvatarComponent,
    FoldButtonIconComponent,
    FoldMenuComponent,
    FoldMenuItemComponent,
    FoldPanelHostComponent,
    FoldSearchComponent,
    FoldSurfaceDirective,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  /**
   * Le rail primaire est **toujours étendu et non-collapsible** : pas de
   * `collapsible` sur `fold-menu` (donc pas de chevron), et `[expanded]="true"`
   * figé — sans cette valeur autoritaire un menu non-collapsible booterait en
   * rail d'icônes (défaut fold : `expanded` non lié suit `collapsible`). Le
   * wordmark est donc rendu en permanence.
   */
  protected readonly menuExpanded = true;

  /** Tiroir mobile — le rail primaire devient off-canvas ≤768px. */
  protected readonly mobileNavOpen = signal(false);

  private readonly router = inject(Router);

  /**
   * Déconnexion. L'auth n'est pas encore câblée côté front : on ferme le tiroir
   * et on revient au tableau de bord. Le vrai flux (purge du jeton + redirection
   * login) se branchera ici quand le backend B2B existera.
   */
  protected logout(): void {
    this.mobileNavOpen.set(false);
    void this.router.navigateByUrl('/');
  }
}
