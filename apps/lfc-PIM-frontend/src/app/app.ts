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
  /** Primary rail: expanded by default, collapsed via the built-in chevron.
   *  Also drives the rail wordmark (hidden while collapsed). */
  protected readonly menuExpanded = signal<boolean | undefined>(true);
  /** Mobile drawer state — the primary rail becomes an off-canvas drawer ≤768px. */
  protected readonly mobileNavOpen = signal(false);

  private readonly router = inject(Router);

  /**
   * Déconnexion. L'auth n'est pas encore câblée côté front (le backend a Auth0,
   * en dérogation `@Public()` pour l'instant) : on ferme le tiroir et on revient
   * à l'accueil. Le vrai flux (purge du jeton + redirection login) se branchera ici.
   */
  protected logout(): void {
    this.mobileNavOpen.set(false);
    void this.router.navigateByUrl('/');
  }
}
