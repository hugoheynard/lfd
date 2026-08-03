import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  FoldAppShellComponent,
  FoldMenuComponent,
  FoldMenuItemComponent,
  FoldPanelHostComponent,
  FoldToastContainerComponent,
} from 'fold-ng';

import { SuiteEmbed } from './suite-embed/suite-embed';

/**
 * Racine de l'app **B2B admin** (staff). Structurée comme PIM : un rail de
 * navigation + le contenu routé. Embarquée dans la suite, le rail passe de
 * `primary` à `secondary` (le rail navy primaire est le switcher de la suite) ;
 * en standalone, `primary`.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    FoldAppShellComponent,
    FoldMenuComponent,
    FoldMenuItemComponent,
    FoldPanelHostComponent,
    FoldToastContainerComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  /** Rail primaire : déployé par défaut, repliable via le chevron intégré. */
  protected readonly menuExpanded = signal<boolean | undefined>(true);
  /** Tiroir off-canvas ≤768px. */
  protected readonly mobileNavOpen = signal(false);

  /** Embarqué dans la suite (iframe) ? → rail `secondary` ; sinon `primary`. */
  protected readonly hosted = inject(SuiteEmbed).hosted;

  private readonly router = inject(Router);

  /**
   * Déconnexion. En prod, la session vit dans le shell (relais de token) ;
   * standalone, l'auth staff se branchera ici. Pour l'instant : ferme le tiroir
   * et revient à l'accueil.
   */
  protected logout(): void {
    this.mobileNavOpen.set(false);
    void this.router.navigateByUrl('/');
  }
}
