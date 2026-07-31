import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  FoldAppShellComponent,
  FoldMenuComponent,
  FoldMenuItemComponent,
  FoldPanelHostComponent,
  FoldSpinnerComponent,
} from 'fold-ng';

import { AuthFacade } from './auth/auth.facade';
import { SUITE_APPS } from './suite/suite-registry';

/**
 * Le **shell hôte** de la suite : mince par conception (login + rail switcher +
 * montage), zéro métier — c'est le point de défaillance unique, on le garde
 * minimal. Le rail primaire liste les apps ; l'app montée occupe le content et
 * apportera son propre menu (donnée exposée par le remote, câblée tâche #21).
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

  /** Tiroir off-canvas ≤768px. */
  protected readonly mobileNavOpen = signal(false);
}
