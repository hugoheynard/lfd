import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FoldSurfaceDirective, FoldViewNavComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { permittedTourManagerViews } from './tour-manager-views';

/**
 * **L'espace Tour manager** — la bande des onglets (Tournées, Feuille de
 * route), puis la vue ouverte (Hugo, 2026-10-26).
 *
 * ⚠️ **Elle n'est pas une page** : aucun `fold-page-layout` ici, chaque vue
 * porte le sien. La bande disparaît à l'impression : la feuille de route
 * s'imprime depuis son onglet, sans les onglets.
 */
@Component({
  selector: 'app-tour-manager-workspace-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldSurfaceDirective, FoldViewNavComponent, RouterOutlet],
  templateUrl: './tour-manager-workspace-page.html',
  styleUrl: './tour-manager-workspace-page.scss',
})
export class TourManagerWorkspacePage {
  private readonly permissions = inject(PermissionsStore);

  /** Les onglets permis : un onglet sans droit mènerait à un refus du garde. */
  protected readonly views = computed(() =>
    permittedTourManagerViews((permission) => this.permissions.can(permission)),
  );
}
