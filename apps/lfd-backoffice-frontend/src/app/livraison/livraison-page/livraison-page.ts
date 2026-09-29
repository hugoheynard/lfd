import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { DeliveryRunSheetView } from '@lfd/contracts';
import type { FoldViewToggleOption } from 'fold-ng';
import {
  FoldButtonComponent,
  FoldDateComponent,
  FoldEmptyStateComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldViewToggleComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import {
  DAY_QUERY_PARAM,
  dayOfQuery,
  isServiceDay,
  parisDayOf,
  shiftDay,
  sortStops,
  summaryOf,
} from '../run-sheet';
import { RunSheetService } from '../run-sheet.service';
import { RunSheetStop } from '../run-sheet-stop/run-sheet-stop';

type SheetState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly view: DeliveryRunSheetView };

const TODAY = '0';
const TOMORROW = '1';

/**
 * **La feuille de route du jour** — ce qui part en livraison, et comment livrer
 * chaque adresse (`documentation/livraisons/plan-preparation-de-tournee.md`,
 * lot 1).
 *
 * Lecture seule, **aucun montant** : un total ici se lirait comme une somme à
 * encaisser à la porte. Le jour par défaut est **demain** — la tournée se
 * prépare la veille. Les arrêts sont triés par fenêtre ; ce que le serveur ne
 * sait pas (adresse non reliée au carnet, commande sans feuille d'atelier) se
 * dit en toutes lettres plutôt que de laisser un trou muet.
 *
 * Les photos de procédure se lisent par la route de la fiche client, sous
 * `b2b_companies:read` : sans ce droit, on garde le texte des étapes et on ne
 * tente pas une lecture qui serait refusée.
 *
 * Imprimable : le choix du jour et le bouton disparaissent sur papier.
 */
@Component({
  selector: 'app-livraison-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldDateComponent,
    FoldEmptyStateComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldViewToggleComponent,
    RunSheetStop,
  ],
  templateUrl: './livraison-page.html',
  styleUrl: './livraison-page.scss',
})
export class DeliveryPage {
  private readonly service = inject(RunSheetService);
  private readonly permissions = inject(PermissionsStore);

  /** Le jour du poste, à Paris : le serveur n'en rend pas sans qu'on le demande. */
  private readonly today = parisDayOf(new Date());

  protected readonly dayOptions: readonly FoldViewToggleOption[] = [
    { value: TODAY, label: 'Aujourd’hui' },
    { value: TOMORROW, label: 'Demain' },
  ];

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Le jour de l'URL (`?jour=`) s'il est lisible, sinon demain. */
  protected readonly day = signal(
    dayOfQuery(this.route.snapshot.queryParamMap.get(DAY_QUERY_PARAM)) ?? shiftDay(this.today, 1),
  );
  protected readonly dayChoice = computed(() => {
    const day = this.day();
    if (day === this.today) {
      return TODAY;
    }
    return day === shiftDay(this.today, 1) ? TOMORROW : '';
  });

  protected readonly state = signal<SheetState>({ status: 'loading' });
  private readonly reload = signal(0);

  protected readonly view = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.view : null;
  });
  protected readonly stops = computed(() => sortStops(this.view()?.stops ?? []));
  protected readonly summary = computed(() => {
    const view = this.view();
    return view === null ? null : summaryOf(view);
  });
  protected readonly canSeePhotos = computed(() => this.permissions.can('b2b_companies:read'));

  /** Un numéro par lecture : une réponse lente d'un autre jour n'écrase pas la bonne. */
  private request = 0;

  constructor() {
    effect(() => {
      const day = this.day();
      this.reload();
      untracked(() => void this.load(day));
    });
  }

  protected pickChoice(value: string): void {
    this.showDay(shiftDay(this.today, value === TODAY ? 0 : 1));
  }

  protected pickDate(value: string): void {
    if (isServiceDay(value)) {
      this.showDay(value);
    }
  }

  /**
   * Le jour choisi s'écrit dans l'URL — un lien partagé ou une page rechargée
   * rouvre le même. `replaceUrl` : parcourir dix jours n'empile pas dix pages
   * à dépiler avec « retour ».
   */
  private showDay(day: string): void {
    this.day.set(day);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [DAY_QUERY_PARAM]: day },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected retry(): void {
    this.reload.update((n) => n + 1);
  }

  protected print(): void {
    window.print();
  }

  private async load(day: string): Promise<void> {
    const request = ++this.request;
    this.state.set({ status: 'loading' });
    try {
      const view = await this.service.day(day);
      if (request === this.request) {
        this.state.set({ status: 'ready', view });
      }
    } catch {
      if (request === this.request) {
        this.state.set({ status: 'error' });
      }
    }
  }
}
