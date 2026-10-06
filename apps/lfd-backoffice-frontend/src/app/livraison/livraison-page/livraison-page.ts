import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { DeliveryRunSheetView } from '@lfd/contracts';
import type { FoldViewToggleOption } from 'fold-ng';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldDateComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldSurfaceDirective,
  FoldViewToggleComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { ordersFromOtherDays } from '../delivery-rounds';
import { DeliveryRoundsService } from '../delivery-rounds.service';
import {
  DAY_QUERY_PARAM,
  dayOfQuery,
  headlineOf,
  isServiceDay,
  longDayOf,
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
 * `delivery_procedures:read`. Sans ce droit, le serveur sert la procédure vide
 * (`plan-droits-par-geste.md`, DG-D8) — ni texte ni photo — et l'écran ne tente
 * pas une lecture qui serait refusée.
 *
 * Imprimable : le choix du jour et le bouton disparaissent sur papier.
 */
@Component({
  selector: 'app-livraison-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldDateComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldSurfaceDirective,
    FoldViewToggleComponent,
    RouterLink,
    RunSheetStop,
  ],
  templateUrl: './livraison-page.html',
  styleUrl: './livraison-page.scss',
})
export class DeliveryPage {
  private readonly service = inject(RunSheetService);
  private readonly rounds = inject(DeliveryRoundsService);
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
  protected readonly longDay = computed(() => longDayOf(this.day()));
  protected readonly headline = computed(() => {
    const summary = this.summary();
    return summary === null ? '' : headlineOf(summary);
  });
  /** Le lien « Tournées » ne s'offre qu'à qui peut les ouvrir. */
  protected readonly canSeeRounds = computed(() => this.permissions.can('delivery_rounds:read'));
  protected readonly canSeePhotos = computed(() =>
    this.permissions.can('delivery_procedures:read'),
  );

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
      // Sans le droit, aucune attente de plus : la page lit comme avant.
      const also = this.permissions.can('delivery_rounds:read')
        ? await this.ordersFromOtherDays(day)
        : [];
      const view = await this.service.day(day, also);
      if (request === this.request) {
        this.state.set({ status: 'ready', view });
      }
    } catch {
      if (request === this.request) {
        this.state.set({ status: 'error' });
      }
    }
  }

  /**
   * Les commandes d'un autre jour demandé que la composition a placées ce
   * jour-là (rapportées, `decisions-par-defaut-2026-10-02.md`, § 4) — même
   * geste que l'écran des tournées, sans canal de plus.
   *
   * Appelée seulement sous `delivery_rounds:read` (le droit de
   * `GET admin/livraison/tournees`) : sans lui, la page ne lit pas la composition et garde son comportement d'avant : la
   * feuille du jour seule, sans ces commandes. Une composition illisible
   * (réseau, 5xx) dégrade de même plutôt que de priver la page de sa feuille.
   */
  private async ordersFromOtherDays(day: string): Promise<readonly string[]> {
    try {
      return ordersFromOtherDays(await this.rounds.day(day));
    } catch {
      return [];
    }
  }
}
