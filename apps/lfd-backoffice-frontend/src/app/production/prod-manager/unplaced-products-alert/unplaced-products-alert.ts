import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { UnplacedProductsOfDayView } from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { parisToday } from '../../../shared/paris-today';
import { WorkstationsService } from '../../workstations.service';
import { UNPLACED_FILTER } from '../../workstations-page/workstations-page';

/**
 * **L'alerte du Prod manager** (plan `fournil/plan-postes-du-fournil.md`,
 * § 3.10) : en mode prod, « N produits du jour à ranger », avec un lien vers
 * la page Postes filtrée. Le serveur choisit sa source (la demande attendue
 * avant l'arrêt, les lignes arrêtées après) et dit le mode.
 *
 * Elle se tait en mode boutique, sans le droit du prévisionnel, et quand sa
 * lecture échoue : c'est un rappel, pas un écran — la fiche, elle, montre
 * toujours le produit sous son rayon, « à ranger ».
 */
@Component({
  selector: 'app-unplaced-products-alert',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, RouterLink],
  templateUrl: './unplaced-products-alert.html',
  styleUrl: './unplaced-products-alert.scss',
})
export class UnplacedProductsAlert {
  private readonly api = inject(WorkstationsService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly filter = { filtre: UNPLACED_FILTER };
  private readonly view = signal<UnplacedProductsOfDayView | null>(null);

  /** Le nombre de produits du jour sans poste ; `0` hors du mode prod. */
  protected readonly count = computed(() => {
    const view = this.view();
    return view === null || view.mode !== 'workstation' ? 0 : view.products.length;
  });
  protected readonly canOpen = computed(() => this.permissions.can('production_workstations:read'));

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    if (!this.permissions.can('production_plan:read')) {
      return;
    }
    try {
      this.view.set(await this.api.unplaced(parisToday()));
    } catch {
      this.view.set(null);
    }
  }
}
