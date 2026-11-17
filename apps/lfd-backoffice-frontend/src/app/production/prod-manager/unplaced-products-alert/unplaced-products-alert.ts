import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { UnplacedProductsOfDayView } from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { parisToday } from '../../../shared/paris-today';
import { WorkstationsService } from '../../workstations.service';
import { UNPLACED_FILTER } from '../../workstations-page/workstations-page';

/**
 * Tous les combien l'alerte regarde si le jour a changé. Une minute : elle ne
 * relit le serveur qu'au changement de jour, pas à chaque coup.
 */
export const DAY_CHECK_MS = 60_000;

/**
 * **L'alerte du Prod manager** (plan `fournil/plan-postes-du-fournil.md`,
 * § 3.10) : en mode prod, « N produits du jour à ranger », avec un lien vers
 * la page Postes filtrée, et les articles du jour hors catalogue, qui ne
 * peuvent pas recevoir de poste. Le serveur choisit sa source (la demande
 * attendue avant l'arrêt, les lignes arrêtées après) et dit le mode.
 *
 * Elle se relit quand le jour change (minuit passé sur un écran resté
 * ouvert) et quand on revient sur l'onglet : un rangement fait ailleurs, ou
 * une commande arrivée, change son compte.
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
  /** Le jour lu en dernier : un changement de jour relit. */
  private readDay: string | null = null;
  /** Le numéro de la dernière lecture : une réponse en retard ne remplace pas la suivante. */
  private readSeq = 0;

  /** Le nombre de produits du jour sans poste ; `0` hors du mode prod. */
  protected readonly count = computed(() => {
    const view = this.view();
    return view === null || view.mode !== 'workstation' ? 0 : view.products.length;
  });
  /** Le nombre d'articles du jour hors catalogue ; `0` hors du mode prod. */
  protected readonly offCatalog = computed(() => {
    const view = this.view();
    return view === null || view.mode !== 'workstation' ? 0 : view.offCatalog.length;
  });
  protected readonly canOpen = computed(() => this.permissions.can('production_workstations:read'));

  constructor() {
    void this.load();
    this.followDayAndTab();
  }

  /** Relit au retour sur l'onglet, et au changement de jour tant qu'il est visible. */
  private followDayAndTab(): void {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) {
      return;
    }
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') {
        void this.load();
      }
    };
    const onTick = (): void => {
      if (document.visibilityState === 'visible' && parisToday() !== this.readDay) {
        void this.load();
      }
    };
    const timer = setInterval(onTick, DAY_CHECK_MS);
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  private async load(): Promise<void> {
    if (!this.permissions.can('production_plan:read')) {
      return;
    }
    const seq = ++this.readSeq;
    const day = parisToday();
    this.readDay = day;
    try {
      const view = await this.api.unplaced(day);
      if (seq === this.readSeq) {
        this.view.set(view);
      }
    } catch {
      if (seq === this.readSeq) {
        this.view.set(null);
      }
    }
  }
}
