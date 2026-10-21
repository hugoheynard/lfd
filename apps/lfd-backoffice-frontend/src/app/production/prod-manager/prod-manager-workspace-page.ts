import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FoldSurfaceDirective, FoldViewNavComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { permittedProdManagerViews } from './prod-manager-views';

/**
 * **L'espace Prod manager** — la bande des onglets (Prévisionnel,
 * Réassorts), puis la vue ouverte (lot R3d, Hugo 2026-10-21 : « les onglets
 * comme ceux du comptoir »).
 *
 * ⚠️ **Elle n'est pas une page** : aucun `fold-page-layout` ici, chaque vue
 * porte le sien. Elle prend en revanche toute la boîte de contenu
 * (`inset: 0`) et défile elle-même : le prévisionnel est un mur qui descend
 * jusqu'au bas de la fenêtre, et il lui faut une hauteur définie sous la bande.
 */
@Component({
  selector: 'app-prod-manager-workspace-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldSurfaceDirective, FoldViewNavComponent, RouterOutlet],
  templateUrl: './prod-manager-workspace-page.html',
  styleUrl: './prod-manager-workspace-page.scss',
})
export class ProdManagerWorkspacePage {
  private readonly permissions = inject(PermissionsStore);

  /** Les onglets permis : un onglet sans droit mènerait à un refus du garde. */
  protected readonly views = computed(() =>
    permittedProdManagerViews((permission) => this.permissions.can(permission)),
  );
}
