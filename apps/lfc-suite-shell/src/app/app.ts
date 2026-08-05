import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  FoldAppShellComponent,
  FoldMenuComponent,
  FoldMenuItemComponent,
  FoldPanelHostComponent,
  FoldSpinnerComponent,
} from 'fold-ng';

import { AuthFacade } from './auth/auth.facade';
import { SuiteBridge } from './suite/suite-bridge';
import { SUITE_APPS } from './suite/suite-registry';

/**
 * Le **shell hôte** de la suite : mince par conception (login + rail switcher +
 * montage), zéro métier — c'est le point de défaillance unique, on le garde
 * minimal. Le rail primaire liste les apps ; l'app montée (iframe) occupe le
 * content avec sa propre chrome.
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
    FoldSpinnerComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly auth = inject(AuthFacade);

  /** Les apps du registre — le rail primaire EST le switcher. */
  protected readonly apps = SUITE_APPS;

  /**
   * Les apps **visibles** pour ce staff : filtrées par entitlement (claim
   * `permissions` du jeton `api-suite`). Réactif — se remplit quand la façade a
   * résolu les permissions. Sans `requiredPermission`, l'app est visible par tout
   * staff. C'est de l'UX : le mur reste chaque backend enfant.
   */
  protected readonly visibleApps = computed(() =>
    this.apps.filter(
      (app) => app.requiredPermission === undefined || this.auth.hasPermission(app.requiredPermission),
    ),
  );

  /** Tiroir off-canvas ≤768px. */
  protected readonly mobileNavOpen = signal(false);

  constructor() {
    // Le bridge écoute les apps embarquées. Démarré ICI (post-bootstrap) et pas
    // en APP_INITIALIZER : le bridge partage le singleton AuthFacade que ce gate
    // construit déjà, donc pas de 2ᵉ résolution d'AuthService (cycle NG0200). Le
    // listener est prêt avant que la 1ʳᵉ iframe (AppFrame, route enfant) ne charge.
    inject(SuiteBridge).start();
  }
}
